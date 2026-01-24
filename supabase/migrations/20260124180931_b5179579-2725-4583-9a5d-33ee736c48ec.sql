-- Create function to trigger auto-sync to FLEx when lender is updated
CREATE OR REPLACE FUNCTION public.auto_sync_lender_to_flex()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only sync if the lender has a flex_lender_id (exists in FLEx)
  IF NEW.flex_lender_id IS NOT NULL THEN
    -- Call the sync edge function asynchronously using pg_net
    PERFORM net.http_post(
      url := 'https://tgkksvazruzbghssnxde.supabase.co/functions/v1/sync-lender-to-flex-webhook',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', current_setting('app.settings.webhook_secret', true)
      ),
      body := jsonb_build_object(
        'lender_id', NEW.id,
        'event', 'lender_updated',
        'flex_lender_id', NEW.flex_lender_id
      )
    );
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create trigger on master_lenders table for updates
DROP TRIGGER IF EXISTS trigger_auto_sync_lender_to_flex ON public.master_lenders;
CREATE TRIGGER trigger_auto_sync_lender_to_flex
  AFTER UPDATE ON public.master_lenders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_sync_lender_to_flex();