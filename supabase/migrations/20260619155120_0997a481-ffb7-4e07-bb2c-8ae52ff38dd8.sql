ALTER TABLE public.ai_action_queue DROP CONSTRAINT IF EXISTS ai_action_queue_action_type_check;
ALTER TABLE public.ai_action_queue ADD CONSTRAINT ai_action_queue_action_type_check
  CHECK (action_type = ANY (ARRAY[
    'create_task','update_lender_status','save_to_data_room','log_note','deal_update',
    'claap_recording_review','claap_action_items',
    'add_status_note','update_funding_source','create_followup_task','create_milestone',
    'update_milestone','update_deal_stage','update_deal_status','update_contact',
    'update_company','draft_email','escalate','reassign_deal'
  ]));