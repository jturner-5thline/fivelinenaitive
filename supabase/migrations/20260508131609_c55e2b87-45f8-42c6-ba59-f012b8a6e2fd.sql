-- Make deals.total_fee a stored generated column so the formula
-- is consistent across every screen and edge function.
-- Formula: retainer_fee + milestone_fee + value * success_fee_percent / 100
ALTER TABLE public.deals DROP COLUMN IF EXISTS total_fee;

ALTER TABLE public.deals
  ADD COLUMN total_fee numeric
  GENERATED ALWAYS AS (
    COALESCE(retainer_fee, 0)
    + COALESCE(milestone_fee, 0)
    + COALESCE(value, 0) * COALESCE(success_fee_percent, 0) / 100
  ) STORED;