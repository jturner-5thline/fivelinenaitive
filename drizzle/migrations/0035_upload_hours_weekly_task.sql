CREATE OR REPLACE FUNCTION public.fn_next_friday_after(_d date)
RETURNS date LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT _d + (CASE WHEN ((5 - EXTRACT(DOW FROM _d)::int + 7) % 7) = 0 THEN 7
                    ELSE ((5 - EXTRACT(DOW FROM _d)::int + 7) % 7) END);
$$;

CREATE OR REPLACE FUNCTION public.fn_upload_hours_task_rollover()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _next date;
BEGIN
  IF NEW.task_type <> 'upload_hours' THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('complete','completed') THEN RETURN NEW; END IF;
  IF OLD.status IN ('complete','completed') THEN RETURN NEW; END IF;
  _next := public.fn_next_friday_after(GREATEST(CURRENT_DATE, COALESCE(NEW.due_date, CURRENT_DATE)));
  IF EXISTS (SELECT 1 FROM public.tasks t WHERE t.task_type = 'upload_hours'
             AND t.assigned_to = NEW.assigned_to AND t.archived_at IS NULL
             AND t.status NOT IN ('complete','completed')) THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.tasks (title, description, assigned_to, assigned_by, company_id, due_date, status, task_type)
  VALUES (NEW.title, NEW.description, NEW.assigned_to, NEW.assigned_by, NEW.company_id, _next, 'not_started', 'upload_hours');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_upload_hours_task_rollover ON public.tasks;
CREATE TRIGGER trg_upload_hours_task_rollover
AFTER UPDATE OF status ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.fn_upload_hours_task_rollover();

INSERT INTO public.tasks (title, description, assigned_to, assigned_by, company_id, due_date, status, task_type)
SELECT 'Upload Hours per Deal',
       'Weekly: log pre-signing and post-signing hours for every open deal in the Active Pipeline.',
       'a6b48ccd-0f2a-4018-886e-241287208ea0', 'a6b48ccd-0f2a-4018-886e-241287208ea0',
       '44556c46-9127-4b12-b14e-d6fee784afcf',
       CASE WHEN EXTRACT(DOW FROM CURRENT_DATE) = 5 THEN CURRENT_DATE ELSE public.fn_next_friday_after(CURRENT_DATE) END,
       'not_started', 'upload_hours'
WHERE NOT EXISTS (SELECT 1 FROM public.tasks WHERE task_type = 'upload_hours'
  AND assigned_to = 'a6b48ccd-0f2a-4018-886e-241287208ea0' AND archived_at IS NULL
  AND status NOT IN ('complete','completed'));