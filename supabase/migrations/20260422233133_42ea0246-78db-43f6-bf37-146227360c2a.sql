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
BEGIN
  stage_changed    := OLD.stage IS DISTINCT FROM NEW.stage;
  pipeline_changed := OLD.pipeline_id IS DISTINCT FROM NEW.pipeline_id;
  amount_changed   := OLD.value IS DISTINCT FROM NEW.value;

  -- Fire when any mapped field changed
  IF stage_changed OR pipeline_changed OR amount_changed THEN
    -- Only push if deal is linked to HubSpot
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
          'fields_changed', (
            CASE WHEN stage_changed THEN ARRAY['stage'] ELSE ARRAY[]::text[] END
            || CASE WHEN pipeline_changed THEN ARRAY['pipeline'] ELSE ARRAY[]::text[] END
            || CASE WHEN amount_changed THEN ARRAY['amount'] ELSE ARRAY[]::text[] END
          )
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;