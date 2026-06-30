
-- Weekly learning pass: Sunday 23:00 UTC. Walks every entitled company and
-- invokes agent-learn-from-feedback. Idempotent — duplicate proposed rules
-- are merged by the function itself.
DO $$
DECLARE
  fn_url TEXT := 'https://tgkksvazruzbghssnxde.supabase.co/functions/v1/agent-learn-from-feedback';
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    PERFORM cron.unschedule('agent-learn-weekly') WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'agent-learn-weekly'
    );
    PERFORM cron.schedule(
      'agent-learn-weekly',
      '0 23 * * 0',
      $cron$
      SELECT net.http_post(
        url := 'https://tgkksvazruzbghssnxde.supabase.co/functions/v1/agent-learn-from-feedback',
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || current_setting('app.settings.service_role_key', true)),
        body := jsonb_build_object('company_id', caa.company_id, 'agent_key', 'admin_agent', 'lookback_days', 14)
      )
      FROM public.company_agent_access caa
      WHERE caa.agent_key = 'admin_agent' AND caa.is_enabled = true;
      $cron$
    );
  END IF;
END $$;
