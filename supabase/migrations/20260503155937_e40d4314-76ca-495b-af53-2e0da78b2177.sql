-- Optional schedule_overrides column (used by the admin UI to record custom intervals)
ALTER TABLE public.recurring_reports
  ADD COLUMN IF NOT EXISTS schedule_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Drop existing jobs if present (idempotent re-run)
DO $$
DECLARE
  j record;
BEGIN
  FOR j IN
    SELECT jobid FROM cron.job
    WHERE jobname IN ('recurring-report-weekly-insights', 'recurring-report-platform-update')
  LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END $$;

-- Friday 12:00 UTC = 08:00 America/New_York during EDT
SELECT cron.schedule(
  'recurring-report-weekly-insights',
  '0 12 * * 5',
  $$
    SELECT net.http_post(
      url := 'https://tgkksvazruzbghssnxde.supabase.co/functions/v1/send-ux-insights-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRna2tzdmF6cnV6Ymdoc3NueGRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU2NDk4MzksImV4cCI6MjA4MTIyNTgzOX0.rKbLgDEfCdQO4hv2_69-Q4r3RiH7_6hsTuwcn6JJpL8'
      ),
      body := jsonb_build_object('report_key', 'weekly-insights', 'triggered_by', 'cron')
    );
  $$
);

-- Every 48 hours (run at minute 0 of hour 0 every other day)
SELECT cron.schedule(
  'recurring-report-platform-update',
  '0 0 */2 * *',
  $$
    SELECT net.http_post(
      url := 'https://tgkksvazruzbghssnxde.supabase.co/functions/v1/send-ux-insights-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRna2tzdmF6cnV6Ymdoc3NueGRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU2NDk4MzksImV4cCI6MjA4MTIyNTgzOX0.rKbLgDEfCdQO4hv2_69-Q4r3RiH7_6hsTuwcn6JJpL8'
      ),
      body := jsonb_build_object('report_key', 'platform-update', 'triggered_by', 'cron')
    );
  $$
);