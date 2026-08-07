ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS asana_duplicate_of_gid text,
  ADD COLUMN IF NOT EXISTS asana_duplicate_of_title text,
  ADD COLUMN IF NOT EXISTS asana_duplicate_status text;

COMMENT ON COLUMN public.tasks.asana_duplicate_status IS 'null = not flagged, pending = awaiting review, dismissed = user kept it, merged = user archived it as a duplicate';

CREATE INDEX IF NOT EXISTS idx_tasks_asana_duplicate_status
  ON public.tasks (asana_duplicate_status)
  WHERE asana_duplicate_status IS NOT NULL;