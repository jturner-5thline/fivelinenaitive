select cron.schedule(
  'claap-backfill-30min',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://tgkksvazruzbghssnxde.supabase.co/functions/v1/claap-backfill',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRna2tzdmF6cnV6Ymdoc3NueGRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU2NDk4MzksImV4cCI6MjA4MTIyNTgzOX0.rKbLgDEfCdQO4hv2_69-Q4r3RiH7_6hsTuwcn6JJpL8"}'::jsonb,
    body := '{"days_back":3,"batch_size":25,"time_budget_ms":45000}'::jsonb
  );
  $$
);