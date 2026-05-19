
-- Add sync status tracking to tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS asana_sync_status text,
  ADD COLUMN IF NOT EXISTS asana_sync_error text,
  ADD COLUMN IF NOT EXISTS asana_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS asana_sync_attempts int NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_tasks_asana_sync_status
  ON public.tasks (asana_sync_status)
  WHERE asana_sync_status = 'failed';

-- Expand asana_sync_log with richer diagnostics
ALTER TABLE public.asana_sync_log
  ADD COLUMN IF NOT EXISTS http_status int,
  ADD COLUMN IF NOT EXISTS response_body jsonb,
  ADD COLUMN IF NOT EXISTS attempt_number int NOT NULL DEFAULT 1;
