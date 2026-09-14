CREATE OR REPLACE FUNCTION public.log_task_completion_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_display_name text;
  v_subject text;
BEGIN
  IF NEW.status IN ('complete', 'completed')
     AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    v_user := COALESCE(NEW.completed_by, NEW.assigned_to);

    -- Only reference actors that still exist in auth.users; otherwise log anonymously
    IF v_user IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_user) THEN
      v_user := NULL;
    END IF;

    SELECT p.display_name INTO v_display_name FROM profiles p WHERE p.user_id = v_user;
    v_subject := 'Task completed: ' || NEW.title;

    IF NEW.deal_id IS NOT NULL THEN
      INSERT INTO activity_logs (deal_id, user_id, activity_type, description, user_display_name, metadata)
      VALUES (NEW.deal_id, v_user, 'task_completed', v_subject, v_display_name,
              jsonb_build_object('task_id', NEW.id, 'task_title', NEW.title,
                                 'contact_id', NEW.contact_id, 'crm_company_id', NEW.crm_company_id));
    END IF;

    IF NEW.contact_id IS NOT NULL THEN
      INSERT INTO contact_activities (contact_id, activity_type, subject, body, logged_by, deal_id, source, metadata)
      VALUES (NEW.contact_id, 'task', v_subject, NEW.description, v_user, NEW.deal_id, 'task',
              jsonb_build_object('task_id', NEW.id, 'event', 'completed', 'crm_company_id', NEW.crm_company_id));
    END IF;

    IF NEW.crm_company_id IS NOT NULL THEN
      INSERT INTO crm_company_activities (crm_company_id, activity_type, subject, body, logged_by, deal_id, contact_id, source, metadata)
      VALUES (NEW.crm_company_id, 'task', v_subject, NEW.description, v_user, NEW.deal_id, NEW.contact_id, 'task',
              jsonb_build_object('task_id', NEW.id, 'event', 'completed'));
    END IF;
  END IF;

  RETURN NEW;
END;
$$;