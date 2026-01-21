-- Add narrative column to deals table
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS narrative TEXT;