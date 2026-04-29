-- Disable the 'Your follow-ups for today' email entirely, platform-wide.
-- Defense in depth: unschedule the cron + disable the notification rule
-- so even if the function is invoked manually, no email is sent.

-- 1) Unschedule the cron job that invokes morning-followup-digest every 10 min
DO $$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'morning-followup-digest';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END $$;

-- 2) Disable the notification rule so notification-engine refuses to dispatch
UPDATE public.notification_rules
   SET is_enabled = false,
       updated_at = now()
 WHERE trigger_key = 'deal.followup.morning_digest';

-- 3) Force-disable the per-user opt-in flag so no profile can re-enable it
UPDATE public.profiles
   SET morning_digest_enabled = false
 WHERE morning_digest_enabled = true;