UPDATE public.ai_action_queue
SET status = 'dismissed',
    dismissed_at = now(),
    rejection_reason = COALESCE(rejection_reason, '') || ' [auto-dismissed: ghost placeholder note — no transcript/summary available]'
WHERE status = 'pending'
  AND action_type = 'add_status_note'
  AND (
    rationale ILIKE '%Full details to be added%'
    OR rationale ILIKE '%once transcript%'
    OR rationale ILIKE '%once transcript/summary is available%'
    OR description ILIKE '%Full details to be added%'
  );