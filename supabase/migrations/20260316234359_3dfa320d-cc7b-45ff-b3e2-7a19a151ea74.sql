-- Create a trigger function that fires the workflow engine when stage changes on the main deals table
CREATE OR REPLACE FUNCTION public.deals_stage_change_workflow_trigger()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  -- Fire on stage changes (UPDATE) or new deal creation (INSERT)
  IF TG_OP = 'INSERT' THEN
    -- For new deals, fire with from_stage as null
    PERFORM net.http_post(
      url := 'https://tgkksvazruzbghssnxde.supabase.co/functions/v1/wf-stage-trigger',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'deal_id', NEW.id,
        'from_stage', null,
        'to_stage', NEW.stage::text,
        'org_company_id', NEW.company_id,
        'event_type', 'deal_created'
      )
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.stage IS DISTINCT FROM NEW.stage THEN
    PERFORM net.http_post(
      url := 'https://tgkksvazruzbghssnxde.supabase.co/functions/v1/wf-stage-trigger',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'deal_id', NEW.id,
        'from_stage', OLD.stage::text,
        'to_stage', NEW.stage::text,
        'org_company_id', NEW.company_id,
        'event_type', 'stage_change'
      )
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- Add trigger to the main deals table (INSERT + UPDATE)
CREATE TRIGGER deals_workflow_stage_trigger
  AFTER INSERT OR UPDATE ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.deals_stage_change_workflow_trigger();