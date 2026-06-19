ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_eod_rundown_notice_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_eod_rundown_email_sent_at TIMESTAMPTZ;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-end-of-day-briefing') THEN
    PERFORM cron.unschedule('send-end-of-day-briefing');
  END IF;
END $$;

SELECT cron.schedule(
  'send-end-of-day-briefing',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url:='https://tgkksvazruzbghssnxde.supabase.co/functions/v1/send-end-of-day-briefing',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRna2tzdmF6cnV6Ymdoc3NueGRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU2NDk4MzksImV4cCI6MjA4MTIyNTgzOX0.rKbLgDEfCdQO4hv2_69-Q4r3RiH7_6hsTuwcn6JJpL8"}'::jsonb,
    body:='{"time": "now"}'::jsonb
  ) AS request_id;
  $$
);