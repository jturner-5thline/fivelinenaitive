
INSERT INTO public.notification_rules (
  name, description, trigger_key, category, is_enabled,
  channels, default_recipients, metadata
)
SELECT
  'Task Assigned',
  'When a task is assigned to you',
  'task_assigned',
  'tasks'::notification_category,
  true,
  '[
    {"channel_type":"in_app","is_enabled":true,
     "template":{"title":"New task assigned to you","body":"{{actor_name}} assigned \"{{task_title}}\" to you."}},
    {"channel_type":"email","is_enabled":false,
     "template":{"subject":"Task Assigned: {{task_title}}","body":"Hi {{recipient_name}},\n\n{{actor_name}} assigned the task \"{{task_title}}\" to you."}}
  ]'::jsonb,
  '{"scope":"user","user_ids":[],"roles":[]}'::jsonb,
  '{}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_rules WHERE trigger_key = 'task_assigned'
);

DROP POLICY IF EXISTS "Users can view tasks in their company" ON public.tasks;
CREATE POLICY "Users can view tasks they own or are assigned to"
  ON public.tasks
  FOR SELECT
  USING (
    auth.uid() = assigned_to
    OR auth.uid() = assigned_by
    OR auth.uid() = created_by
    OR is_same_company_as_user(auth.uid(), assigned_by)
  );

CREATE OR REPLACE FUNCTION public.notify_task_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_rule_id uuid;
BEGIN
  v_actor := COALESCE(NEW.assigned_by, NEW.created_by);

  IF NEW.assigned_to IS NULL OR NEW.assigned_to = v_actor THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_rule_id
  FROM public.notification_rules
  WHERE trigger_key = 'task_assigned' AND is_enabled = true
  LIMIT 1;

  INSERT INTO public.notification_instances (
    rule_id, trigger_key, recipient_user_id, channel_type, status,
    title, body, rendered_data, context, actor_user_id
  ) VALUES (
    v_rule_id,
    'task_assigned',
    NEW.assigned_to,
    'in_app'::notification_channel_type,
    'pending'::notification_instance_status,
    'New task assigned to you',
    NEW.title,
    jsonb_build_object('task_title', NEW.title),
    jsonb_build_object(
      'task_id', NEW.id,
      'deal_id', NEW.deal_id,
      'due_date', NEW.due_date,
      'assigned_by', v_actor
    ),
    v_actor
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_task_assignment failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_task_assignment ON public.tasks;
CREATE TRIGGER trg_notify_task_assignment
  AFTER INSERT OR UPDATE OF assigned_to ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_task_assignment();
