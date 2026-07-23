UPDATE ai_action_queue
SET description = ''
WHERE status = 'pending'
  AND title ILIKE '%Needs Tasks%'
  AND description ILIKE '%not archived, not on hold%';