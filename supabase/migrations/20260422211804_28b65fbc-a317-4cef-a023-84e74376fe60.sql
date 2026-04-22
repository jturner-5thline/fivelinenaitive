-- 1. Profile timezone + digest prefs
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/New_York',
  ADD COLUMN IF NOT EXISTS morning_digest_time time NOT NULL DEFAULT '07:00:00',
  ADD COLUMN IF NOT EXISTS morning_digest_enabled boolean NOT NULL DEFAULT true;

-- 2. Notification audit (admin-visible record of every follow-up notification)
CREATE TABLE IF NOT EXISTS public.notification_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_key text NOT NULL,
  recipient_user_id uuid NOT NULL,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  channel text NOT NULL,
  status text NOT NULL,
  title text,
  body text,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_audit_trigger ON public.notification_audit(trigger_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_audit_recipient ON public.notification_audit(recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_audit_deal ON public.notification_audit(deal_id, trigger_key, created_at DESC);

ALTER TABLE public.notification_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view notification audit" ON public.notification_audit;
CREATE POLICY "Admins view notification audit"
  ON public.notification_audit FOR SELECT
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Recipients view their own audit rows" ON public.notification_audit;
CREATE POLICY "Recipients view their own audit rows"
  ON public.notification_audit FOR SELECT
  USING (auth.uid() = recipient_user_id);

-- service role inserts; no client policy for INSERT/UPDATE/DELETE

-- 3. Scheduled follow-up actions (for the +3 day deal-created reminder)
CREATE TABLE IF NOT EXISTS public.scheduled_followup_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_key text NOT NULL,
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | fired | cancelled | failed
  fired_at timestamptz,
  error_message text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sfa_due ON public.scheduled_followup_actions(status, scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_sfa_deal ON public.scheduled_followup_actions(deal_id);

ALTER TABLE public.scheduled_followup_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage scheduled followup actions" ON public.scheduled_followup_actions;
CREATE POLICY "Admins manage scheduled followup actions"
  ON public.scheduled_followup_actions FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Members view scheduled actions for their company deals" ON public.scheduled_followup_actions;
CREATE POLICY "Members view scheduled actions for their company deals"
  ON public.scheduled_followup_actions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.deals d
    JOIN public.company_members cm ON cm.company_id = d.company_id
    WHERE d.id = scheduled_followup_actions.deal_id AND cm.user_id = auth.uid()
  ));

-- 4. Helper: normalize a stage string to a canonical key
CREATE OR REPLACE FUNCTION public.normalize_stage(stage_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(coalesce(stage_text, ''), '[^a-zA-Z0-9]+', '_', 'g'));
$$;

-- 5. Trigger function: fires notifications on deal insert + relevant stage updates
CREATE OR REPLACE FUNCTION public.fn_deal_followup_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fn_url text;
  service_key text;
  trigger_key text;
  new_stage_norm text;
  old_stage_norm text;
  recent_audit_count int;
  payload jsonb;
BEGIN
  -- Get edge function URL + service key from app settings (set via insert tool below)
  SELECT current_setting('app.settings.supabase_url', true) INTO fn_url;
  SELECT current_setting('app.settings.service_role_key', true) INTO service_key;

  IF fn_url IS NULL OR service_key IS NULL THEN
    RAISE WARNING 'fn_deal_followup_dispatch: missing app.settings — skipping';
    RETURN NEW;
  END IF;

  -- ── INSERT: schedule a +3 day follow-up reminder ──
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.scheduled_followup_actions (trigger_key, deal_id, scheduled_for, context)
    VALUES (
      'deal.followup.created_3d',
      NEW.id,
      NEW.created_at + interval '3 days',
      jsonb_build_object('deal_name', NEW.company, 'created_at', NEW.created_at)
    );
    RETURN NEW;
  END IF;

  -- ── UPDATE: only react to stage changes ──
  IF TG_OP = 'UPDATE' AND NEW.stage IS DISTINCT FROM OLD.stage THEN
    new_stage_norm := public.normalize_stage(NEW.stage);
    old_stage_norm := public.normalize_stage(OLD.stage);

    -- Map stage → trigger key (Proposal Issued / Agreement Pending)
    IF new_stage_norm IN ('proposal_issued', 'proposal_issued_') THEN
      trigger_key := 'deal.followup.proposal_issued';
    ELSIF new_stage_norm IN ('agreement_pending', 'agreement_pending_') THEN
      trigger_key := 'deal.followup.agreement_pending';
    ELSE
      RETURN NEW;
    END IF;

    -- 24h dedup: don't refire same trigger for same deal within 24h
    SELECT count(*) INTO recent_audit_count
    FROM public.notification_audit
    WHERE deal_id = NEW.id
      AND notification_audit.trigger_key = fn_deal_followup_dispatch.trigger_key
      AND created_at > now() - interval '24 hours';

    IF recent_audit_count > 0 THEN
      RAISE NOTICE 'fn_deal_followup_dispatch: dedup hit for deal=% trigger=%', NEW.id, trigger_key;
      RETURN NEW;
    END IF;

    -- Async dispatch via pg_net
    payload := jsonb_build_object(
      'triggerKey', trigger_key,
      'context', jsonb_build_object(
        'deal_id', NEW.id,
        'deal_name', NEW.company,
        'stage', NEW.stage,
        'previous_stage', OLD.stage,
        'company_id', NEW.company_id
      )
    );

    PERFORM net.http_post(
      url := fn_url || '/functions/v1/notification-engine',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := payload
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deal_followup_dispatch ON public.deals;
CREATE TRIGGER trg_deal_followup_dispatch
  AFTER INSERT OR UPDATE OF stage ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_deal_followup_dispatch();

-- 6. Seed notification rules (idempotent upsert by trigger_key)
INSERT INTO public.notification_rules (trigger_key, name, description, category, is_enabled, channels, default_recipients, metadata)
VALUES
  (
    'deal.followup.created_3d',
    'Deal created — 3-day follow-up',
    'Reminds the deal owner/manager to follow up 3 days after a deal is created.',
    'system',
    true,
    '[
      {"channel_type":"in_app","is_enabled":true,"template":{"title":"Follow up on {{deal_name}}","body":"It''s been 3 days since {{deal_name}} was created. Time to follow up."}},
      {"channel_type":"email","is_enabled":true,"template":{"subject":"Follow up: {{deal_name}}","title":"Follow up on {{deal_name}}","body":"Hi {{recipient_name}},\n\n{{deal_name}} was created 3 days ago. This is your scheduled follow-up reminder.\n\n— naitive"}}
    ]'::jsonb,
    '{"roles":["DEAL_OWNER","DEAL_MANAGER"]}'::jsonb,
    '{"category":"followup"}'::jsonb
  ),
  (
    'deal.followup.proposal_issued',
    'Stage → Proposal Issued',
    'Triggers a follow-up workflow when a deal moves to Proposal Issued.',
    'system',
    true,
    '[
      {"channel_type":"in_app","is_enabled":true,"template":{"title":"Proposal issued: {{deal_name}}","body":"{{deal_name}} just moved to Proposal Issued. Run the proposal-issued follow-up workflow."}},
      {"channel_type":"email","is_enabled":true,"template":{"subject":"Proposal Issued: {{deal_name}}","title":"Proposal issued: {{deal_name}}","body":"Hi {{recipient_name}},\n\n{{deal_name}} just moved into Proposal Issued. Please run the follow-up workflow for this stage.\n\n— naitive"}}
    ]'::jsonb,
    '{"roles":["DEAL_OWNER","DEAL_MANAGER"]}'::jsonb,
    '{"category":"followup"}'::jsonb
  ),
  (
    'deal.followup.agreement_pending',
    'Stage → Agreement Pending',
    'Triggers a follow-up workflow when a deal moves to Agreement Pending.',
    'system',
    true,
    '[
      {"channel_type":"in_app","is_enabled":true,"template":{"title":"Agreement pending: {{deal_name}}","body":"{{deal_name}} just moved to Agreement Pending. Run the agreement-pending follow-up workflow."}},
      {"channel_type":"email","is_enabled":true,"template":{"subject":"Agreement Pending: {{deal_name}}","title":"Agreement pending: {{deal_name}}","body":"Hi {{recipient_name}},\n\n{{deal_name}} just moved into Agreement Pending. Please run the follow-up workflow for this stage.\n\n— naitive"}}
    ]'::jsonb,
    '{"roles":["DEAL_OWNER","DEAL_MANAGER"]}'::jsonb,
    '{"category":"followup"}'::jsonb
  ),
  (
    'deal.followup.morning_digest',
    'Morning follow-up digest',
    'Daily 7am (user local time) digest of follow-ups due today.',
    'system',
    true,
    '[
      {"channel_type":"in_app","is_enabled":true,"template":{"title":"Your follow-ups for today","body":"{{digest_body}}"}},
      {"channel_type":"email","is_enabled":true,"template":{"subject":"Your follow-ups for today","title":"Your follow-ups for today","body":"Hi {{recipient_name}},\n\n{{digest_body}}\n\n— naitive"}}
    ]'::jsonb,
    '{"roles":["TAGGED_USER"]}'::jsonb,
    '{"category":"followup","notify_actor":true}'::jsonb
  )
ON CONFLICT (trigger_key) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      is_enabled = EXCLUDED.is_enabled,
      channels = EXCLUDED.channels,
      default_recipients = EXCLUDED.default_recipients,
      metadata = EXCLUDED.metadata,
      updated_at = now();