CREATE OR REPLACE FUNCTION public.log_task_assignment_status_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_actor := COALESCE(auth.uid(), NEW.created_by, NEW.assigned_to);
    IF v_actor IS NULL THEN RETURN NEW; END IF;

    INSERT INTO public.task_activity (task_id, actor_id, event_type, payload)
    VALUES (NEW.id, v_actor, 'created',
      jsonb_build_object(
        'title', NEW.title,
        'status', NEW.status,
        'assigned_to', NEW.assigned_to,
        'due_date', NEW.due_date,
        'deal_id', NEW.deal_id
      ));

    IF NEW.assigned_to IS NOT NULL THEN
      INSERT INTO public.task_activity (task_id, actor_id, event_type, payload)
      VALUES (NEW.id, v_actor, 'assigned',
        jsonb_build_object('to', NEW.assigned_to, 'from', NULL));
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE (tasks table has no updated_by column; fall back to completed_by/assigned/created)
  v_actor := COALESCE(auth.uid(), NEW.completed_by, NEW.assigned_to, NEW.created_by, OLD.assigned_to);
  IF v_actor IS NULL THEN RETURN NEW; END IF;

  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    INSERT INTO public.task_activity (task_id, actor_id, event_type, payload)
    VALUES (NEW.id, v_actor, 'assigned',
      jsonb_build_object('from', OLD.assigned_to, 'to', NEW.assigned_to));
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.task_activity (task_id, actor_id, event_type, payload)
    VALUES (NEW.id, v_actor, 'status_changed',
      jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;

  RETURN NEW;
END;
$function$;