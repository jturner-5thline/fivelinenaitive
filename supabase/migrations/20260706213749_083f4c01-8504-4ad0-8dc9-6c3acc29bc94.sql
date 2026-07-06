UPDATE public.ai_action_queue
SET status = 'dismissed', dismissed_at = now()
WHERE status = 'pending'
  AND action_type = 'update_deal_status'
  AND (
    new_values IS NULL
    OR new_values::text = '{}'
    OR lower(coalesce(new_values->>'status', new_values->>'new_status', '')) NOT IN ('on-track','at-risk','off-track','on track','at risk','off track')
  );