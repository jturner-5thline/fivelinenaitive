-- Add hour tracking and fee columns to deals table
ALTER TABLE public.deals 
ADD COLUMN IF NOT EXISTS pre_signing_hours numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS post_signing_hours numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_fee numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS retainer_fee numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS milestone_fee numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS success_fee_percent numeric DEFAULT 0;