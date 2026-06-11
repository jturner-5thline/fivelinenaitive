ALTER TABLE public.deals DROP COLUMN IF EXISTS total_fee;
ALTER TABLE public.deals
  ADD COLUMN total_fee numeric
  GENERATED ALWAYS AS (
    COALESCE(value, 0) * COALESCE(success_fee_percent, 0) / 100
  ) STORED;