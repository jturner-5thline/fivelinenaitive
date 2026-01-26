-- Add financial_comments column to deal_writeups table
ALTER TABLE public.deal_writeups 
ADD COLUMN IF NOT EXISTS financial_comments JSONB DEFAULT '[]'::jsonb;