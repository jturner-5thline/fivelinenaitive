
-- FLEx visibility hardening (retry without invalid audit insert).

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS flex_visibility_override text;

ALTER TABLE public.deals
  DROP CONSTRAINT IF EXISTS deals_flex_visibility_override_check;

ALTER TABLE public.deals
  ADD CONSTRAINT deals_flex_visibility_override_check
  CHECK (flex_visibility_override IS NULL OR flex_visibility_override IN ('show','hide'));

CREATE OR REPLACE FUNCTION public.is_flex_hidden_stage(p_stage text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  norm text;
BEGIN
  IF p_stage IS NULL OR length(trim(p_stage)) = 0 THEN
    RETURN false;
  END IF;
  norm := lower(p_stage);
  norm := regexp_replace(norm, '[^a-z0-9]+', '-', 'g');
  norm := regexp_replace(norm, '(^-+)|(-+$)', '', 'g');
  RETURN norm IN (
    'terms-issued',
    'in-due-diligence',
    'due-diligence',
    'funded-invoiced',
    'funded',
    'invoiced',
    'closed-won',
    'closed-lost',
    'on-hold',
    'paused',
    'deal-paused-on-hold',
    'client-paused-deal'
  );
END;
$$;

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
  was_hidden boolean;
  is_hidden boolean;
BEGIN
  IF NEW.flex_visibility_override = 'show' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.flex_sync_history
    WHERE deal_id = NEW.id
      AND status = 'success'
  ) INTO has_flex_sync;

  IF NOT has_flex_sync THEN
    RETURN NEW;
  END IF;

  SELECT
    COALESCE(s.remove_on_due_diligence, true) AS remove_on_due_diligence,
    COALESCE(s.remove_on_closed_won,   true) AS remove_on_closed_won,
    COALESCE(s.remove_on_closed_lost,  true) AS remove_on_closed_lost,
    COALESCE(s.remove_on_archived,     true) AS remove_on_archived
  INTO settings
  FROM (SELECT NEW.company_id AS cid) c
  LEFT JOIN public.flex_sync_settings s ON s.company_id = c.cid;

  was_hidden := public.is_flex_hidden_stage(OLD.stage);
  is_hidden  := public.is_flex_hidden_stage(NEW.stage);

  IF NEW.flex_visibility_override = 'hide'
     AND (OLD.flex_visibility_override IS DISTINCT FROM 'hide') THEN
    matched_rule := 'manual_hide';
  ELSIF settings.remove_on_archived
     AND NEW.status = 'archived'
     AND (OLD.status IS DISTINCT FROM 'archived') THEN
    matched_rule := 'archived';
  ELSIF is_hidden AND NOT was_hidden THEN
    IF NEW.stage IN ('closed-won','Closed Won','Closed won') AND settings.remove_on_closed_won THEN
      matched_rule := 'closed_won';
    ELSIF NEW.stage IN ('closed-lost','Closed Lost','Closed lost') AND settings.remove_on_closed_lost THEN
      matched_rule := 'closed_lost';
    ELSIF lower(coalesce(NEW.stage,'')) ~ 'due.?diligence' AND settings.remove_on_due_diligence THEN
      matched_rule := 'due_diligence';
    ELSE
      matched_rule := 'stage_hidden';
    END IF;
  END IF;

  IF matched_rule IS NULL THEN
    RETURN NEW;
  END IF;

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
AFTER UPDATE OF stage, status, flex_visibility_override ON public.deals
FOR EACH ROW
EXECUTE FUNCTION public.trigger_flex_auto_remove_on_deal_change();

ALTER TABLE public.flex_auto_removal_audit
  DROP CONSTRAINT IF EXISTS flex_auto_removal_audit_trigger_rule_check;

ALTER TABLE public.flex_auto_removal_audit
  ADD CONSTRAINT flex_auto_removal_audit_trigger_rule_check
  CHECK (trigger_rule IN (
    'due_diligence',
    'closed_won',
    'closed_lost',
    'archived',
    'stage_hidden',
    'manual_hide'
  ));

-- Retroactive cleanup: queue an unpublish for every deal currently in a
-- hidden stage that is still actively published on FLEx.
DO $$
DECLARE
  r RECORD;
  removed_count integer := 0;
BEGIN
  FOR r IN
    SELECT d.id, d.company_id, d.stage, d.status
    FROM public.deals d
    WHERE public.is_flex_hidden_stage(d.stage)
      AND COALESCE(d.flex_visibility_override, '') <> 'show'
      AND EXISTS (
        SELECT 1 FROM public.flex_sync_history h
        WHERE h.deal_id = d.id AND h.status = 'success'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.flex_sync_history h2
        WHERE h2.deal_id = d.id
          AND h2.status = 'unpublished'
          AND h2.created_at > (
            SELECT MAX(h3.created_at)
            FROM public.flex_sync_history h3
            WHERE h3.deal_id = d.id AND h3.status = 'success'
          )
      )
  LOOP
    PERFORM net.http_post(
      url := 'https://tgkksvazruzbghssnxde.supabase.co/functions/v1/flex-auto-remove',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'deal_id',         r.id,
        'company_id',      r.company_id,
        'trigger_rule',    'stage_hidden',
        'previous_stage',  r.stage,
        'new_stage',       r.stage,
        'previous_status', r.status,
        'new_status',      r.status
      )
    );
    removed_count := removed_count + 1;
  END LOOP;
  RAISE NOTICE 'FLEx retroactive cleanup queued % deal(s) for unpublishing.', removed_count;
END;
$$;
