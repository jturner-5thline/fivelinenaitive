-- Add financial_years JSONB column to deal_writeups table
ALTER TABLE public.deal_writeups 
ADD COLUMN IF NOT EXISTS financial_years JSONB DEFAULT '[]'::jsonb;