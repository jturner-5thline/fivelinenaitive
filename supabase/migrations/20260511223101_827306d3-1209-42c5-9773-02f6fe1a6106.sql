ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS source_email_message_id text,
  ADD COLUMN IF NOT EXISTS source_email_thread_id text,
  ADD COLUMN IF NOT EXISTS source_email_subject text,
  ADD COLUMN IF NOT EXISTS source_email_from text;

CREATE INDEX IF NOT EXISTS idx_tasks_source_email_thread
  ON public.tasks (source_email_thread_id)
  WHERE source_email_thread_id IS NOT NULL;