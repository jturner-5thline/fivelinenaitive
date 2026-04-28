
UPDATE public.notification_rules
SET default_recipients = jsonb_build_object(
  'roles', jsonb_build_array('DEAL_OWNER', 'DEAL_MANAGER')
)
WHERE trigger_key = 'email_priority_signal';
