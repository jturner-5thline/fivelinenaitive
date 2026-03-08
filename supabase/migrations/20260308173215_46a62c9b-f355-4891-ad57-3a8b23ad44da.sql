CREATE OR REPLACE FUNCTION public.wf_deal_stage_change_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    -- Log the stage change
    INSERT INTO public.wf_workflows_log (workflow_name, trigger_type, deal_id, org_company_id, metadata_json)
    VALUES ('stage_change_' || NEW.stage::text, 'stage_change', NEW.id, NEW.org_company_id,
      jsonb_build_object('from_stage', OLD.stage::text, 'to_stage', NEW.stage::text));

    -- Call edge function to fire matching workflows
    PERFORM net.http_post(
      url := 'https://tgkksvazruzbghssnxde.supabase.co/functions/v1/wf-stage-trigger',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'deal_id', NEW.id,
        'from_stage', OLD.stage::text,
        'to_stage', NEW.stage::text,
        'org_company_id', NEW.org_company_id
      )
    );
  END IF;
  RETURN NEW;
END;
$function$