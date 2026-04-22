
-- 1. Per-company FLEx sync settings (auto-removal rules)
CREATE TABLE IF NOT EXISTS public.flex_sync_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  remove_on_due_diligence boolean NOT NULL DEFAULT true,
  remove_on_closed_won boolean NOT NULL DEFAULT true,
  remove_on_closed_lost boolean NOT NULL DEFAULT true,
  remove_on_archived boolean NOT NULL DEFAULT true,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.flex_sync_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view their flex sync settings"
ON public.flex_sync_settings
FOR SELECT
TO authenticated
USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company admins can insert their flex sync settings"
ON public.flex_sync_settings
FOR INSERT
TO authenticated
WITH CHECK (public.is_company_admin(auth.uid(), company_id));

CREATE POLICY "Company admins can update their flex sync settings"
ON public.flex_sync_settings
FOR UPDATE
TO authenticated
USING (public.is_company_admin(auth.uid(), company_id))
WITH CHECK (public.is_company_admin(auth.uid(), company_id));

CREATE TRIGGER set_updated_at_flex_sync_settings
BEFORE UPDATE ON public.flex_sync_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Audit log of automatic FLEx removals
CREATE TABLE IF NOT EXISTS public.flex_auto_removal_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  trigger_rule text NOT NULL CHECK (trigger_rule IN (
    'due_diligence', 'closed_won', 'closed_lost', 'archived'
  )),
  previous_stage text,
  new_stage text,
  previous_status text,
  new_status text,
  flex_deal_id text,
  removal_status text NOT NULL DEFAULT 'pending'
    CHECK (removal_status IN ('pending', 'success', 'skipped', 'failed')),
  error_message text,
  triggered_by uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flex_auto_removal_audit_deal_id
  ON public.flex_auto_removal_audit(deal_id);
CREATE INDEX IF NOT EXISTS idx_flex_auto_removal_audit_company_id
  ON public.flex_auto_removal_audit(company_id, created_at DESC);

ALTER TABLE public.flex_auto_removal_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view their flex auto-removal audit"
ON public.flex_auto_removal_audit
FOR SELECT
TO authenticated
USING (
  company_id IS NOT NULL
  AND public.is_company_member(auth.uid(), company_id)
);

-- (No client INSERT/UPDATE/DELETE policies — only the service role / edge function writes here.)

-- 3. Database trigger that fires the auto-removal edge function
--    when a deal's stage or status moves into a removal-eligible state.
CREATE OR REPLACE FUNCTION public.trigger_flex_auto_remove_on_deal_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  settings RECORD;
  matched_rule text := NULL;
  has_flex_sync boolean;
BEGIN
  -- Only act when stage or status actually changed
  IF (OLD.stage IS NOT DISTINCT FROM NEW.stage)
     AND (OLD.status IS NOT DISTINCT FROM NEW.status) THEN
    RETURN NEW;
  END IF;

  -- Only consider deals that have at least one prior FLEx sync record
  -- (i.e. the deal was actually pushed to FLEx at some point).
  SELECT EXISTS (
    SELECT 1 FROM public.flex_sync_history
    WHERE deal_id = NEW.id
      AND status = 'success'
  ) INTO has_flex_sync;

  IF NOT has_flex_sync THEN
    RETURN NEW;
  END IF;

  -- Load this company's auto-removal settings (defaults all-on if no row)
  SELECT
    COALESCE(s.remove_on_due_diligence, true) AS remove_on_due_diligence,
    COALESCE(s.remove_on_closed_won,   true) AS remove_on_closed_won,
    COALESCE(s.remove_on_closed_lost,  true) AS remove_on_closed_lost,
    COALESCE(s.remove_on_archived,     true) AS remove_on_archived
  INTO settings
  FROM (SELECT NEW.company_id AS cid) c
  LEFT JOIN public.flex_sync_settings s ON s.company_id = c.cid;

  -- Evaluate each rule. We only want NEW transitions into a removal state,
  -- not repeated updates while already in that state.
  IF settings.remove_on_archived
     AND NEW.status = 'archived'
     AND (OLD.status IS DISTINCT FROM 'archived') THEN
    matched_rule := 'archived';
  ELSIF settings.remove_on_closed_won
     AND NEW.stage = 'closed-won'
     AND (OLD.stage IS DISTINCT FROM 'closed-won') THEN
    matched_rule := 'closed_won';
  ELSIF settings.remove_on_closed_lost
     AND NEW.stage = 'closed-lost'
     AND (OLD.stage IS DISTINCT FROM 'closed-lost') THEN
    matched_rule := 'closed_lost';
  ELSIF settings.remove_on_due_diligence
     AND NEW.stage IN ('in-due-diligence', 'due-diligence')
     AND (OLD.stage IS DISTINCT FROM NEW.stage) THEN
    matched_rule := 'due_diligence';
  END IF;

  IF matched_rule IS NULL THEN
    RETURN NEW;
  END IF;

  -- Fire the edge function asynchronously via pg_net
  PERFORM net.http_post(
    url := 'https://tgkksvazruzbghssnxde.supabase.co/functions/v1/flex-auto-remove',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'deal_id',         NEW.id,
      'company_id',      NEW.company_id,
      'trigger_rule',    matched_rule,
      'previous_stage',  OLD.stage,
      'new_stage',       NEW.stage,
      'previous_status', OLD.status,
      'new_status',      NEW.status
    )
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS deals_flex_auto_remove ON public.deals;
CREATE TRIGGER deals_flex_auto_remove
AFTER UPDATE OF stage, status ON public.deals
FOR EACH ROW
EXECUTE FUNCTION public.trigger_flex_auto_remove_on_deal_change();
