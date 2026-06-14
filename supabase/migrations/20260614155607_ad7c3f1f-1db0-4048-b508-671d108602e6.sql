
-- 1) Store the publishable anon JWT in Vault so the cron command no longer
--    embeds it in plaintext (it remains accessible via vault.decrypted_secrets
--    to the postgres role that pg_cron runs as).
DO $$
DECLARE
  v_secret text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRna2tzdmF6cnV6Ymdoc3NueGRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU2NDk4MzksImV4cCI6MjA4MTIyNTgzOX0.rKbLgDEfCdQO4hv2_69-Q4r3RiH7_6hsTuwcn6JJpL8';
  v_existing uuid;
BEGIN
  SELECT id INTO v_existing FROM vault.secrets WHERE name = 'admin_agent_sweep_anon_key';
  IF v_existing IS NULL THEN
    PERFORM vault.create_secret(v_secret, 'admin_agent_sweep_anon_key', 'Anon JWT used by the admin-agent-sweep pg_cron job to call the edge function. Rotate via vault.update_secret.');
  ELSE
    PERFORM vault.update_secret(v_existing, v_secret, 'admin_agent_sweep_anon_key', 'Anon JWT used by the admin-agent-sweep pg_cron job to call the edge function. Rotate via vault.update_secret.');
  END IF;
END $$;

-- 2) Unschedule the existing cron job and re-create it with a command that
--    pulls the bearer from Vault at execution time, leaving no plaintext
--    token in cron.job.command.
DO $$
BEGIN
  PERFORM cron.unschedule('admin-agent-friday-sweep');
EXCEPTION WHEN OTHERS THEN
  NULL; -- job may not exist on a fresh project
END $$;

SELECT cron.schedule(
  'admin-agent-friday-sweep',
  '0 13 * * 5',  -- Fridays at 13:00 UTC (≈08-09:00 ET)
  $cron$
  SELECT net.http_post(
    url := 'https://tgkksvazruzbghssnxde.supabase.co/functions/v1/admin-agent-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'admin_agent_sweep_anon_key' LIMIT 1
      )
    ),
    body := jsonb_build_object('source','cron','triggered_at', now())
  ) AS request_id;
  $cron$
);
