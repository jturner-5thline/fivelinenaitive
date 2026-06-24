DELETE FROM public.ai_action_queue
WHERE status = 'pending'
  AND action_type = 'update_funding_source'
  AND (title ILIKE '%Camber Road%Censys%' OR (deal_name ILIKE '%Censys%' AND title ILIKE '%Camber Road%'));