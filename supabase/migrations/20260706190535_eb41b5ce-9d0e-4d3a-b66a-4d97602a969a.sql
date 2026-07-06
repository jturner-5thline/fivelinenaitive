ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS follow_up_task_created boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_calendar_events_followup_scan
  ON public.calendar_events (end_time)
  WHERE follow_up_task_created = false AND is_cancelled = false;