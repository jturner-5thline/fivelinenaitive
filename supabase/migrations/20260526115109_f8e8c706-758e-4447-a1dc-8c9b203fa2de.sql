-- Convert legacy priority values to NULL (no priority)
ALTER TABLE public.tasks ALTER COLUMN priority DROP NOT NULL;
ALTER TABLE public.tasks ALTER COLUMN priority DROP DEFAULT;

UPDATE public.tasks
SET priority = NULL
WHERE priority IN ('high', 'medium', 'low');

-- Restrict allowed values
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_priority_urgent_only_chk
  CHECK (priority IS NULL OR priority = 'urgent');
