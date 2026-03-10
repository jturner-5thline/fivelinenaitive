CREATE OR REPLACE FUNCTION public.notify_flex_on_lender_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only fire when status changes to 'approved' or 'merged' for requests from FLEx
  IF (NEW.status IN ('approved', 'merged') AND OLD.status = 'pending' 
      AND NEW.source_lender_id IS NOT NULL 
      AND NEW.source_system = 'flex') THEN
    
    PERFORM net.http_post(
      url := 'https://tgkksvazruzbghssnxde.supabase.co/functions/v1/notify-flex-lender-approved',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('supabase.service_role_key', true)
      ),
      body := jsonb_build_object(
        'flex_profile_id', NEW.source_lender_id,
        'lender_name', COALESCE(NEW.existing_lender_name, NEW.incoming_data->>'name'),
        'lender_email', NEW.incoming_data->>'email',
        'trigger_source', 'db_trigger'
      )
    );
  END IF;
  
  RETURN NEW;
END;
$function$;

CREATE TRIGGER on_lender_sync_request_approved
  AFTER UPDATE ON public.lender_sync_requests
  FOR EACH ROW
  WHEN (OLD.status = 'pending' AND NEW.status IN ('approved', 'merged'))
  EXECUTE FUNCTION public.notify_flex_on_lender_approval();