-- 1. Add source column (nullable; existing live rows remain untagged)
ALTER TABLE public.deal_stage_history
  ADD COLUMN IF NOT EXISTS source TEXT;

-- 2. Performance index for Activity feed pagination
CREATE INDEX IF NOT EXISTS idx_dsh_deal_changed_at
  ON public.deal_stage_history (deal_id, changed_at DESC);

-- 3. Tag prior 5th Line backfills (changed_at written at exactly 12:00:00 UTC)
UPDATE public.deal_stage_history
SET source = 'backfill'
WHERE company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'
  AND source IS NULL
  AND (changed_at AT TIME ZONE 'UTC')::time = '12:00:00';