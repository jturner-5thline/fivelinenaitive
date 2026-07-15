
UPDATE public.ai_action_queue
SET
  title = regexp_replace(title, ' Has no Tasks$', ' Needs Tasks'),
  new_values = jsonb_build_object(
    '_synthetic', 'update_tasks',
    'description', COALESCE(new_values->>'description', ''),
    'tasks', jsonb_build_array(
      jsonb_build_object(
        'title', '',
        'assigned_to', new_values->>'assigned_to',
        'due_date', new_values->>'due_date',
        'description', ''
      )
    )
  ),
  updated_at = now()
WHERE status = 'pending'
  AND action_type = 'create_followup_task'
  AND (
    (new_values->>'_synthetic') = 'update_tasks'
    OR title LIKE '% Has no Tasks'
  );
