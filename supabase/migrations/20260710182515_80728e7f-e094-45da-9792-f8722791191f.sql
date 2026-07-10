CREATE OR REPLACE FUNCTION public.trigger_detect_sales_call_deals_on_claap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://tgkksvazruzbghssnxde.supabase.co/functions/v1/detect-sales-call-deals',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRna2tzdmF6cnV6Ymdoc3NueGRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU2NDk4MzksImV4cCI6MjA4MTIyNTgzOX0.rKbLgDEfCdQO4hv2_69-Q4r3RiH7_6hsTuwcn6JJpL8"}'::jsonb,
    body := jsonb_build_object('lookback_minutes', 1440, 'trigger', 'claap_recording_sync', 'claap_recording_id', NEW.id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_claap_recordings_redraft_deals ON public.claap_recordings;
CREATE TRIGGER trg_claap_recordings_redraft_deals
AFTER INSERT OR UPDATE OF transcript_available, summary, synthesized_note, hydration_complete, started_at
ON public.claap_recordings
FOR EACH ROW
EXECUTE FUNCTION public.trigger_detect_sales_call_deals_on_claap();