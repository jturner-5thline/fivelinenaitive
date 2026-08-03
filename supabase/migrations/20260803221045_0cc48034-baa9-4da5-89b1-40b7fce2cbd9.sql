ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS source_queue_item_id uuid;

CREATE INDEX IF NOT EXISTS idx_tasks_source_calendar_event_id
  ON public.tasks (source_calendar_event_id)
  WHERE source_calendar_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_source_queue_item_id
  ON public.tasks (source_queue_item_id)
  WHERE source_queue_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_nylas_event_id
  ON public.tasks (nylas_event_id)
  WHERE nylas_event_id IS NOT NULL;

-- Backfill event provenance from the existing calendar_item_sources backlinks
-- so previously-created follow-ups can be deduped against wrap-up cards.
UPDATE public.tasks t
SET source_calendar_event_id = cis.source_record_id
FROM public.calendar_item_sources cis
WHERE cis.task_id = t.id
  AND t.source_calendar_event_id IS NULL
  AND cis.source_record_id IS NOT NULL
  AND cis.source_module IN ('meeting_notes', 'claap_summary', 'agenda');