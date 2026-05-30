CREATE UNIQUE INDEX IF NOT EXISTS deal_stage_history_dedupe_uidx
ON public.deal_stage_history (
  deal_id,
  event_type,
  (COALESCE(to_stage_id, '')),
  (COALESCE(from_stage_id, '')),
  (COALESCE(to_stage, '')),
  (COALESCE(from_stage, '')),
  changed_at
);