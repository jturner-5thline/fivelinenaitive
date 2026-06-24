DELETE FROM public.ai_action_queue
WHERE status = 'pending'
  AND action_type = 'create_followup_task'
  AND title ~* 'update\s+funding\s+sources?';