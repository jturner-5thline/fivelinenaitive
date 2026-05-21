
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nylas_event_id TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_due_at ON public.tasks(due_at);

-- Backfill: existing due_date -> 09:00 America/New_York
UPDATE public.tasks
SET due_at = (due_date::text || ' 09:00:00')::timestamp AT TIME ZONE 'America/New_York'
WHERE due_at IS NULL AND due_date IS NOT NULL;

-- Trigger: keep due_date in sync with due_at so legacy readers still work.
CREATE OR REPLACE FUNCTION public.sync_task_due_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.due_at IS NOT NULL THEN
    NEW.due_date := (NEW.due_at AT TIME ZONE 'America/New_York')::date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_sync_due_date ON public.tasks;
CREATE TRIGGER trg_tasks_sync_due_date
BEFORE INSERT OR UPDATE OF due_at ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.sync_task_due_date();
