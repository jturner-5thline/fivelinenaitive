-- Expand suppression to cover On Hold, Archived, Closed Won, Closed Lost
CREATE OR REPLACE FUNCTION public.is_deal_notification_suppressed(_deal_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.deals d
    WHERE d.id = _deal_id
      AND (
        d.status IN ('archived', 'on-hold', 'on_hold', 'closed-won', 'closed_won', 'closed-lost', 'closed_lost')
        OR d.stage  IN ('on-hold', 'on_hold', 'closed-won', 'closed_won', 'closed-lost', 'closed_lost')
        OR d.pipeline_id IN (
          SELECT dp.id FROM public.deal_pipelines dp
          WHERE lower(dp.name) LIKE '%in development%'
        )
      )
  )
$function$;

-- Extend the state-change trigger so it ALSO cancels pending scheduled
-- follow-up reminders for the deal when it transitions into a suppressed state.
CREATE OR REPLACE FUNCTION public.suppress_deal_notifications_on_state_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_deal_notification_suppressed(NEW.id) THEN
    IF NOT (
      OLD.status IN ('archived', 'on-hold', 'on_hold', 'closed-won', 'closed_won', 'closed-lost', 'closed_lost')
      OR OLD.stage IN ('on-hold', 'on_hold', 'closed-won', 'closed_won', 'closed-lost', 'closed_lost')
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

      -- Clear in-app engagement alerts
      UPDATE public.flex_notifications
      SET read_at = now()
      WHERE deal_id = NEW.id
        AND read_at IS NULL;

      -- Remove pending deal notification queue entries
      DELETE FROM public.pending_deal_notifications
      WHERE deal_id = NEW.id;

      -- Cancel pending scheduled follow-up reminder actions
      UPDATE public.scheduled_followup_actions
      SET status = 'cancelled',
          error_message = 'Deal moved to suppressed status: ' || COALESCE(NEW.status, NEW.stage, 'unknown')
      WHERE deal_id = NEW.id
        AND status = 'pending';

      RAISE LOG 'Suppressed all notifications for deal % (status=%, stage=%, pipeline=%)',
        NEW.id, NEW.status, NEW.stage, NEW.pipeline_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;