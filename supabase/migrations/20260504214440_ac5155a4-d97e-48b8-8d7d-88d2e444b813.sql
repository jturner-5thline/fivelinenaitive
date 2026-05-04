
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS contact_title text,
  ADD COLUMN IF NOT EXISTS icp_category text,
  ADD COLUMN IF NOT EXISTS prospect_type text,
  ADD COLUMN IF NOT EXISTS owned_by text,
  ADD COLUMN IF NOT EXISTS next_step text,
  ADD COLUMN IF NOT EXISTS next_step_date date,
  ADD COLUMN IF NOT EXISTS dm_present text,
  ADD COLUMN IF NOT EXISTS dm_name text,
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS why_not_moving_forward text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS pain_points_confirmed text,
  ADD COLUMN IF NOT EXISTS objections_raised text,
  ADD COLUMN IF NOT EXISTS competitors_mentioned text,
  ADD COLUMN IF NOT EXISTS key_signal text,
  ADD COLUMN IF NOT EXISTS product_gap_flagged text;
