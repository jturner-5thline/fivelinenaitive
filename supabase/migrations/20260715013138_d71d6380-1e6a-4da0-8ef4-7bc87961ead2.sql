UPDATE public.ai_action_queue
SET status = 'dismissed',
    dismissed_at = now(),
    rejection_reason = 'stale_update_tasks_title_rewrite'
WHERE status = 'pending'
  AND action_type = 'create_followup_task'
  AND (new_values->>'_synthetic') = 'update_tasks'
  AND title = 'Update Tasks to "Update Tasks"';