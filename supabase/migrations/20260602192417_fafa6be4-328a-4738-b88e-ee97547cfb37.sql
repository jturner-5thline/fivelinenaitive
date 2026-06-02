ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS lost_reason text,
  ADD COLUMN IF NOT EXISTS lost_at timestamptz;