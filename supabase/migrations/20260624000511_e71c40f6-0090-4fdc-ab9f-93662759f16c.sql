-- Remove the invalid queued AI action that targets a non-existent stage "nda-signed-diligence".
-- This stage does not exist in the Acorn Learning Group pipeline; the row was generated incorrectly
-- and cannot be executed. Deleting it clears the bogus item from the approval queue.
DELETE FROM public.ai_action_queue
WHERE action_type = 'update_deal_stage'
  AND status = 'pending'
  AND payload->'on_approve_execution_payload'->'new_values'->>'stage' = 'nda-signed-diligence';