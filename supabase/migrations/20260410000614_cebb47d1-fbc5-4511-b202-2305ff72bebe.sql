
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS hubspot_sync_status text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS hubspot_sync_error text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS hubspot_last_synced_at timestamptz DEFAULT NULL;
