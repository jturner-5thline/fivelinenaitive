-- Add sync_source column to tasks table for loop prevention
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS sync_source text DEFAULT NULL;

-- Add a comment explaining usage
COMMENT ON COLUMN public.tasks.sync_source IS 'Set to "asana" when updated by Asana webhook to prevent sync loops. NULL for normal user edits.';