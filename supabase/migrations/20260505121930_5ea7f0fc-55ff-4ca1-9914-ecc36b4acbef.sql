-- Change QuickBooks/HubSpot auto-sync default interval to 48 hours and update existing rows.
-- Also clears last_qb_sync timestamps so the scheduler will force a fresh sync on its next pass.
ALTER TABLE public.sync_schedule_settings
  ALTER COLUMN interval_hours SET DEFAULT 48;

UPDATE public.sync_schedule_settings
SET interval_hours = 48,
    last_qb_sync = NULL,
    updated_at = now()
WHERE interval_hours <> 48 OR last_qb_sync IS NOT NULL;