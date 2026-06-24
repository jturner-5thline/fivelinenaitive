DELETE FROM public.ai_action_queue
WHERE status = 'pending'
  AND action_type = 'create_followup_task'
  AND (
    COALESCE(title, '') ~* '^\s*(create\s+)?follow[-\s]?up(\s+task)?(\s+(on|with|for|re|regarding|about)\s+[^.\n]{0,80})?\s*\.?\s*$'
    OR COALESCE(new_values->>'title', '') ~* '^\s*(create\s+)?follow[-\s]?up(\s+task)?(\s+(on|with|for|re|regarding|about)\s+[^.\n]{0,80})?\s*\.?\s*$'
  );