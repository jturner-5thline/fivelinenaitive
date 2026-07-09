
-- Ensure tasks always inherit the creator's company_id so they remain
-- visible in tenant-scoped queries (e.g. the /tasks "All" view).
CREATE OR REPLACE FUNCTION public.ensure_task_company_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_company uuid;
BEGIN
  IF NEW.company_id IS NULL THEN
    -- Prefer the creator's company, fall back to the assignee's.
    SELECT cm.company_id INTO resolved_company
    FROM public.company_members cm
    WHERE cm.user_id = COALESCE(NEW.assigned_by, NEW.created_by, NEW.assigned_to)
    LIMIT 1;

    IF resolved_company IS NULL AND NEW.assigned_to IS NOT NULL THEN
      SELECT cm.company_id INTO resolved_company
      FROM public.company_members cm
      WHERE cm.user_id = NEW.assigned_to
      LIMIT 1;
    END IF;

    NEW.company_id := resolved_company;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_task_company_id ON public.tasks;
CREATE TRIGGER trg_ensure_task_company_id
BEFORE INSERT ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.ensure_task_company_id();

-- Backfill existing rows where company_id is null but the creator/assignee
-- belongs to exactly one company.
UPDATE public.tasks t
SET company_id = sub.company_id
FROM (
  SELECT t2.id, cm.company_id
  FROM public.tasks t2
  JOIN public.company_members cm
    ON cm.user_id = COALESCE(t2.assigned_by, t2.created_by, t2.assigned_to)
  WHERE t2.company_id IS NULL
) sub
WHERE t.id = sub.id;
