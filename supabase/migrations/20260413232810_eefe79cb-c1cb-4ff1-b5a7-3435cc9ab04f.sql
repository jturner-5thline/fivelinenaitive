
-- Create a reusable function to check if a deal is notification-suppressed
CREATE OR REPLACE FUNCTION public.is_deal_notification_suppressed(_deal_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.deals d
    WHERE d.id = _deal_id
      AND (
        d.status IN ('archived', 'on-hold', 'on_hold')
        OR d.stage IN ('on-hold', 'on_hold')
        OR d.pipeline_id IN (
          SELECT dp.id FROM public.deal_pipelines dp
          WHERE lower(dp.name) LIKE '%in development%'
        )
      )
  )
$$;

-- Trigger function: when a deal enters a suppressed state, bulk-clear all outstanding notifications
CREATE OR REPLACE FUNCTION public.suppress_deal_notifications_on_state_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act if the deal just became suppressed (check new state)
  IF public.is_deal_notification_suppressed(NEW.id) THEN
    -- Was it previously NOT suppressed? (avoid re-clearing on every update)
    -- We check by evaluating old values
    IF NOT (
      OLD.status IN ('archived', 'on-hold', 'on_hold')
      OR OLD.stage IN ('on-hold', 'on_hold')
      OR OLD.pipeline_id IN (
        SELECT dp.id FROM public.deal_pipelines dp
        WHERE lower(dp.name) LIKE '%in development%'
      )
    ) THEN
      -- Clear flex_info_notifications
      UPDATE public.flex_info_notifications
      SET status = 'dismissed'
      WHERE deal_id = NEW.id
        AND status IN ('pending', 'read');

      -- Clear flex_notifications (in-app engagement alerts)
      UPDATE public.flex_notifications
      SET read_at = now()
      WHERE deal_id = NEW.id
        AND read_at IS NULL;

      -- Remove pending deal notification queue entries
      DELETE FROM public.pending_deal_notifications
      WHERE deal_id = NEW.id;

      RAISE LOG 'Suppressed all notifications for deal % (status=%, stage=%, pipeline=%)',
        NEW.id, NEW.status, NEW.stage, NEW.pipeline_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach the trigger
DROP TRIGGER IF EXISTS suppress_notifications_on_deal_state_change ON public.deals;
CREATE TRIGGER suppress_notifications_on_deal_state_change
  AFTER UPDATE OF status, stage, pipeline_id ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.suppress_deal_notifications_on_state_change();

-- Update the lender notification trigger to skip suppressed deals
CREATE OR REPLACE FUNCTION public.notify_email_on_lender_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deal_record record;
  changes jsonb := '{}'::jsonb;
  actor_name text;
  evt_type text;
BEGIN
  -- Skip notification if deal is suppressed (archived, on-hold, In Development)
  IF public.is_deal_notification_suppressed(NEW.deal_id) THEN
    RETURN NEW;
  END IF;

  SELECT d.company, d.user_id, d.company_id INTO deal_record
  FROM deals d
  WHERE d.id = NEW.deal_id;

  IF deal_record.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO actor_name
  FROM public.profiles
  WHERE user_id = auth.uid();

  IF TG_OP = 'INSERT' THEN
    evt_type := 'lender_added';
    IF NEW.stage IS NOT NULL THEN
      changes := changes || jsonb_build_object('stage', jsonb_build_object('from', null, 'to', NEW.stage));
    END IF;
    IF NEW.tracking_status IS NOT NULL THEN
      changes := changes || jsonb_build_object('tracking_status', jsonb_build_object('from', null, 'to', NEW.tracking_status));
    END IF;
    IF NEW.notes IS NOT NULL AND NEW.notes != '' THEN
      changes := changes || jsonb_build_object('notes', jsonb_build_object('from', null, 'to', LEFT(NEW.notes, 200)));
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    evt_type := 'lender_updated';
    IF OLD.stage IS DISTINCT FROM NEW.stage THEN
      changes := changes || jsonb_build_object('stage', jsonb_build_object('from', OLD.stage, 'to', NEW.stage));
    END IF;
    IF OLD.substage IS DISTINCT FROM NEW.substage THEN
      changes := changes || jsonb_build_object('substage', jsonb_build_object('from', OLD.substage, 'to', NEW.substage));
    END IF;
    IF OLD.tracking_status IS DISTINCT FROM NEW.tracking_status THEN
      changes := changes || jsonb_build_object('tracking_status', jsonb_build_object('from', OLD.tracking_status, 'to', NEW.tracking_status));
    END IF;
    IF OLD.notes IS DISTINCT FROM NEW.notes THEN
      changes := changes || jsonb_build_object('notes', jsonb_build_object('from', LEFT(COALESCE(OLD.notes, ''), 200), 'to', LEFT(COALESCE(NEW.notes, ''), 200)));
    END IF;
    IF OLD.pass_reason IS DISTINCT FROM NEW.pass_reason THEN
      changes := changes || jsonb_build_object('pass_reason', jsonb_build_object('from', OLD.pass_reason, 'to', NEW.pass_reason));
    END IF;
    IF OLD.quote_amount IS DISTINCT FROM NEW.quote_amount THEN
      changes := changes || jsonb_build_object('quote_amount', jsonb_build_object('from', OLD.quote_amount::text, 'to', NEW.quote_amount::text));
    END IF;
    IF OLD.quote_rate IS DISTINCT FROM NEW.quote_rate THEN
      changes := changes || jsonb_build_object('quote_rate', jsonb_build_object('from', OLD.quote_rate::text, 'to', NEW.quote_rate::text));
    END IF;
    IF OLD.quote_term IS DISTINCT FROM NEW.quote_term THEN
      changes := changes || jsonb_build_object('quote_term', jsonb_build_object('from', OLD.quote_term, 'to', NEW.quote_term));
    END IF;
    IF OLD.score IS DISTINCT FROM NEW.score THEN
      changes := changes || jsonb_build_object('score', jsonb_build_object('from', OLD.score::text, 'to', NEW.score::text));
    END IF;
  END IF;

  -- Only queue if there are actual changes (or it's an INSERT)
  IF changes != '{}'::jsonb OR TG_OP = 'INSERT' THEN
    INSERT INTO public.pending_deal_notifications (
      deal_id, company_id, event_type, entity_name, entity_id,
      change_summary, changed_by, changed_by_name
    ) VALUES (
      NEW.deal_id, deal_record.company_id, evt_type, NEW.name, NEW.id,
      changes, auth.uid(), actor_name
    );
  END IF;

  RETURN NEW;
END;
$$;
