-- 1. Auto-fill task associations when one of deal_id/contact_id/crm_company_id is known
CREATE OR REPLACE FUNCTION public.fill_task_associations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_id uuid;
  v_company_id uuid;
BEGIN
  -- Deal known but no contact: pick primary (or earliest) contact from contact_deals
  IF NEW.deal_id IS NOT NULL AND NEW.contact_id IS NULL THEN
    SELECT cd.contact_id
      INTO v_contact_id
      FROM contact_deals cd
     WHERE cd.deal_id = NEW.deal_id
     ORDER BY (cd.role = 'primary') DESC NULLS LAST, cd.created_at ASC
     LIMIT 1;
    NEW.contact_id := v_contact_id;
  END IF;

  -- Deal known but no company: copy from the deal
  IF NEW.deal_id IS NOT NULL AND NEW.crm_company_id IS NULL THEN
    SELECT d.crm_company_id INTO v_company_id FROM deals d WHERE d.id = NEW.deal_id;
    NEW.crm_company_id := v_company_id;
  END IF;

  -- Contact known but no company: copy from the contact
  IF NEW.contact_id IS NOT NULL AND NEW.crm_company_id IS NULL THEN
    SELECT c.crm_company_id INTO v_company_id FROM contacts c WHERE c.id = NEW.contact_id;
    NEW.crm_company_id := v_company_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_task_associations ON public.tasks;
CREATE TRIGGER trg_fill_task_associations
BEFORE INSERT OR UPDATE OF deal_id, contact_id, crm_company_id
ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.fill_task_associations();

-- 2. On task completion, log to all three activity timelines
CREATE OR REPLACE FUNCTION public.log_task_completion_activity()
RETURNS TRIGGER
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

DROP TRIGGER IF EXISTS trg_log_task_completion ON public.tasks;
CREATE TRIGGER trg_log_task_completion
AFTER UPDATE OF status
ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.log_task_completion_activity();

-- 3. Backfill associations for existing tasks (one-time)
UPDATE public.tasks t
   SET contact_id = sub.contact_id
  FROM (
    SELECT DISTINCT ON (cd.deal_id) cd.deal_id, cd.contact_id
      FROM contact_deals cd
     ORDER BY cd.deal_id, (cd.role = 'primary') DESC NULLS LAST, cd.created_at ASC
  ) sub
 WHERE t.deal_id = sub.deal_id AND t.contact_id IS NULL;

UPDATE public.tasks t
   SET crm_company_id = d.crm_company_id
  FROM public.deals d
 WHERE t.deal_id = d.id
   AND t.crm_company_id IS NULL
   AND d.crm_company_id IS NOT NULL;

UPDATE public.tasks t
   SET crm_company_id = c.crm_company_id
  FROM public.contacts c
 WHERE t.contact_id = c.id
   AND t.crm_company_id IS NULL
   AND c.crm_company_id IS NOT NULL;