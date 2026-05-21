-- Allow new claap-related action types in the approval queue
ALTER TABLE public.ai_action_queue
  DROP CONSTRAINT IF EXISTS ai_action_queue_action_type_check;

ALTER TABLE public.ai_action_queue
  ADD CONSTRAINT ai_action_queue_action_type_check
  CHECK (action_type IN (
    'create_task',
    'update_lender_status',
    'save_to_data_room',
    'log_note',
    'deal_update',
    'claap_recording_review',
    'claap_action_items'
  ));

-- Allow service-role inserts from the claap webhook (RLS bypass via SECURITY DEFINER is not used;
-- the webhook runs with service-role key which already bypasses RLS, so no policy change needed).