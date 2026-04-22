CREATE OR REPLACE FUNCTION public.notify_hubspot_deal_stage_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  stage_changed boolean;
  pipeline_changed boolean;
  amount_changed boolean;
  owner_changed boolean;
  manager_changed boolean;
BEGIN
  stage_changed    := OLD.stage IS DISTINCT FROM NEW.stage;
  pipeline_changed := OLD.pipeline_id IS DISTINCT FROM NEW.pipeline_id;
  amount_changed   := OLD.value IS DISTINCT FROM NEW.value;
  owner_changed    := OLD.deal_owner IS DISTINCT FROM NEW.deal_owner;
  manager_changed  := OLD.manager IS DISTINCT FROM NEW.manager;

  IF stage_changed OR pipeline_changed OR amount_changed OR owner_changed OR manager_changed THEN
    IF NEW.hubspot_deal_id IS NOT NULL AND NEW.hubspot_deal_id != '' THEN
      PERFORM net.http_post(
        url := 'https://tgkksvazruzbghssnxde.supabase.co/functions/v1/hubspot-deal-stage-push',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object(
          'deal_id', NEW.id,
          'pipeline_id', NEW.pipeline_id,
          'stage', NEW.stage,
          'hubspot_deal_id', NEW.hubspot_deal_id,
          'company_id', NEW.company_id,
          'amount', NEW.value,
          'deal_owner', NEW.deal_owner,
          'manager', NEW.manager,
          'fields_changed', (
            CASE WHEN stage_changed    THEN ARRAY['stage']    ELSE ARRAY[]::text[] END
            || CASE WHEN pipeline_changed THEN ARRAY['pipeline'] ELSE ARRAY[]::text[] END
            || CASE WHEN amount_changed   THEN ARRAY['amount']   ELSE ARRAY[]::text[] END
            || CASE WHEN owner_changed    THEN ARRAY['deal_owner'] ELSE ARRAY[]::text[] END
            || CASE WHEN manager_changed  THEN ARRAY['manager']  ELSE ARRAY[]::text[] END
          )
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;