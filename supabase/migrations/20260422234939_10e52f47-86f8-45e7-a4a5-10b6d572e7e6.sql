-- Update the lender_access_request (Information Request Received) notification rule
-- Recipients: Deal Manager (primary) + ALL company Admins (CC).
-- The notification-engine resolves DEAL_MANAGER first, falls back to DEAL_OWNER
-- when manager is unset (flagged as fallback_to_owner=true in audit metadata),
-- and scopes ADMIN to the deal's company. Recipients are de-duplicated.
UPDATE public.notification_rules
SET default_recipients = jsonb_build_object('roles', jsonb_build_array('DEAL_MANAGER', 'ADMIN'))
WHERE trigger_key = 'lender_access_request';