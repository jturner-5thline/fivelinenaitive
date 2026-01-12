-- Create function to call webhook-sync edge function
CREATE OR REPLACE FUNCTION public.trigger_webhook_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  payload jsonb;
  record_data jsonb;
  old_record_data jsonb;
BEGIN
  -- Build record data
  IF TG_OP = 'DELETE' THEN
    record_data := NULL;
    old_record_data := to_jsonb(OLD);
  ELSIF TG_OP = 'UPDATE' THEN
    record_data := to_jsonb(NEW);
    old_record_data := to_jsonb(OLD);
  ELSE
    record_data := to_jsonb(NEW);
    old_record_data := NULL;
  END IF;

  -- Build payload
  payload := jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'record', record_data,
    'old_record', old_record_data,
    'timestamp', now()::text
  );

  -- Call edge function asynchronously using pg_net
  PERFORM net.http_post(
    url := 'https://tgkksvazruzbghssnxde.supabase.co/functions/v1/webhook-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := payload
  );

  -- Return appropriate record
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Create triggers for deals table
DROP TRIGGER IF EXISTS webhook_sync_deals_insert ON public.deals;
CREATE TRIGGER webhook_sync_deals_insert
  AFTER INSERT ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_webhook_sync();

DROP TRIGGER IF EXISTS webhook_sync_deals_update ON public.deals;
CREATE TRIGGER webhook_sync_deals_update
  AFTER UPDATE ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_webhook_sync();

DROP TRIGGER IF EXISTS webhook_sync_deals_delete ON public.deals;
CREATE TRIGGER webhook_sync_deals_delete
  AFTER DELETE ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_webhook_sync();

-- Create triggers for deal_lenders table
DROP TRIGGER IF EXISTS webhook_sync_deal_lenders_insert ON public.deal_lenders;
CREATE TRIGGER webhook_sync_deal_lenders_insert
  AFTER INSERT ON public.deal_lenders
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_webhook_sync();

DROP TRIGGER IF EXISTS webhook_sync_deal_lenders_update ON public.deal_lenders;
CREATE TRIGGER webhook_sync_deal_lenders_update
  AFTER UPDATE ON public.deal_lenders
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_webhook_sync();

DROP TRIGGER IF EXISTS webhook_sync_deal_lenders_delete ON public.deal_lenders;
CREATE TRIGGER webhook_sync_deal_lenders_delete
  AFTER DELETE ON public.deal_lenders
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_webhook_sync();

-- Create triggers for profiles table
DROP TRIGGER IF EXISTS webhook_sync_profiles_insert ON public.profiles;
CREATE TRIGGER webhook_sync_profiles_insert
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_webhook_sync();

DROP TRIGGER IF EXISTS webhook_sync_profiles_update ON public.profiles;
CREATE TRIGGER webhook_sync_profiles_update
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_webhook_sync();