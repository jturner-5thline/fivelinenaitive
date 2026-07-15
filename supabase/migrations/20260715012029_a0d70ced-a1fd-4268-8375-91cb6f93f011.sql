WITH keyed AS (
  SELECT id, deal_id, created_at,
         COALESCE(payload->'on_approve_execution_payload'->'new_values'->>'source_email_id','') AS eid,
         COALESCE(payload->'on_approve_execution_payload'->'new_values'->>'attachment_name','') AS att
  FROM public.ai_action_queue
  WHERE status='pending' AND action_type='save_to_data_room'
),
ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY deal_id, eid, att ORDER BY created_at ASC) AS rn
  FROM keyed WHERE eid <> '' AND att <> ''
)
UPDATE public.ai_action_queue q
SET status='dismissed',
    dismissed_at=now(),
    rejection_reason='duplicate_save_to_data_room_backfill'
FROM ranked r
WHERE q.id = r.id AND r.rn > 1;