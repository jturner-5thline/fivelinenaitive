
-- Remove old lender-only cron job and add new unified deal notification cron job
SELECT cron.unschedule('send-batched-lender-notifications');

SELECT cron.schedule(
  'send-batched-deal-notifications',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url:='https://tgkksvazruzbghssnxde.supabase.co/functions/v1/send-batched-deal-notifications',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRna2tzdmF6cnV6Ymdoc3NueGRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU2NDk4MzksImV4cCI6MjA4MTIyNTgzOX0.rKbLgDEfCdQO4hv2_69-Q4r3RiH7_6hsTuwcn6JJpL8"}'::jsonb,
    body:='{"time": "now"}'::jsonb
  ) AS request_id;
  $$
);
