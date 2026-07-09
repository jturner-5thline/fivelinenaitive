
-- Notify task collaborators on activity (due date changes, subtask created,
-- task completion, subtask completion). Assignees and the actor are excluded.
CREATE OR REPLACE FUNCTION public.notify_task_collaborators_of_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _parent_task_id uuid;
  _parent_title text;
  _root_title text;
  _actor_name text;
  _collab RECORD;
  _title text;
  _body text;
  _target_task uuid;
  _context jsonb;
BEGIN
  -- Skip if no auth context (backfills, system jobs)
  IF _actor IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(display_name, email, 'Someone')
    INTO _actor_name
    FROM public.profiles
    WHERE user_id = _actor;
  _actor_name := COALESCE(_actor_name, 'Someone');

  -- ============================================================
  -- Subtask created (INSERT on child task)
  -- ============================================================
  IF TG_OP = 'INSERT' AND NEW.parent_task_id IS NOT NULL THEN
    SELECT title INTO _parent_title FROM public.tasks WHERE id = NEW.parent_task_id;
    _target_task := NEW.parent_task_id;
    _title := 'New subtask added';
    _body := _actor_name || ' added subtask "' || NEW.title || '"'
             || COALESCE(' to "' || _parent_title || '"', '');
    _context := jsonb_build_object('subtask_id', NEW.id, 'event', 'subtask_created');

    FOR _collab IN
      SELECT tc.user_id
      FROM public.task_collaborators tc
      WHERE tc.task_id = _target_task
        AND tc.user_id <> _actor
        AND tc.user_id <> COALESCE(
          (SELECT assigned_to FROM public.tasks WHERE id = _target_task),
          '00000000-0000-0000-0000-000000000000'::uuid
        )
    LOOP
      PERFORM public.create_task_inapp_notification(
        _target_task, _collab.user_id, 'task_subtask_added',
        _title, _body, _context
      );
    END LOOP;

    RETURN NEW;
  END IF;

  -- ============================================================
  -- UPDATE events on the task itself
  -- ============================================================
  IF TG_OP = 'UPDATE' THEN

    -- Due date changed on a root task -> notify its collaborators
    IF NEW.parent_task_id IS NULL
       AND NEW.due_date IS DISTINCT FROM OLD.due_date THEN
      _target_task := NEW.id;
      _title := 'Task due date updated';
      _body := _actor_name || ' changed the due date on "' || NEW.title || '" to '
               || COALESCE(to_char(NEW.due_date::date, 'Mon DD, YYYY'), 'no date');
      _context := jsonb_build_object('event', 'task_due_date_changed',
                                     'previous_due_date', OLD.due_date,
                                     'new_due_date', NEW.due_date);

      FOR _collab IN
        SELECT tc.user_id
        FROM public.task_collaborators tc
        WHERE tc.task_id = _target_task
          AND tc.user_id <> _actor
          AND tc.user_id <> COALESCE(NEW.assigned_to, '00000000-0000-0000-0000-000000000000'::uuid)
      LOOP
        PERFORM public.create_task_inapp_notification(
          _target_task, _collab.user_id, 'task_due_date_changed',
          _title, _body, _context
        );
      END LOOP;
    END IF;

    -- Status transitioned to complete
    IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'complete' THEN
      IF NEW.parent_task_id IS NULL THEN
        -- Root task completed -> notify its collaborators
        _target_task := NEW.id;
        _title := 'Task completed';
        _body := _actor_name || ' completed "' || NEW.title || '"';
        _context := jsonb_build_object('event', 'task_completed');
      ELSE
        -- Subtask completed -> notify parent's collaborators
        SELECT title INTO _parent_title FROM public.tasks WHERE id = NEW.parent_task_id;
        _target_task := NEW.parent_task_id;
        _title := 'Subtask completed';
        _body := _actor_name || ' completed subtask "' || NEW.title || '"'
                 || COALESCE(' on "' || _parent_title || '"', '');
        _context := jsonb_build_object('subtask_id', NEW.id, 'event', 'subtask_completed');
      END IF;

      FOR _collab IN
        SELECT tc.user_id
        FROM public.task_collaborators tc
        WHERE tc.task_id = _target_task
          AND tc.user_id <> _actor
          AND tc.user_id <> COALESCE(
            (SELECT assigned_to FROM public.tasks WHERE id = _target_task),
            '00000000-0000-0000-0000-000000000000'::uuid
          )
      LOOP
        PERFORM public.create_task_inapp_notification(
          _target_task, _collab.user_id,
          CASE WHEN NEW.parent_task_id IS NULL THEN 'task_completed' ELSE 'task_subtask_completed' END,
          _title, _body, _context
        );
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_task_collaborators ON public.tasks;
CREATE TRIGGER trg_notify_task_collaborators
AFTER INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_task_collaborators_of_activity();
