CREATE INDEX IF NOT EXISTS idx_lender_notes_history_deal_lender_created
  ON public.lender_notes_history (deal_lender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_deal_type_created
  ON public.activity_logs (deal_id, activity_type, created_at DESC);