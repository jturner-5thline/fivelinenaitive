ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS source_calendar_event_id text,
  ADD COLUMN IF NOT EXISTS source_calendar_event_title text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS asana_user_gid text;

CREATE INDEX IF NOT EXISTS idx_tasks_source_calendar_event_id
  ON public.tasks (source_calendar_event_id)
  WHERE source_calendar_event_id IS NOT NULL;