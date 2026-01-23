-- Add company_highlights field to deal_writeups table
ALTER TABLE public.deal_writeups 
ADD COLUMN IF NOT EXISTS company_highlights JSONB DEFAULT '[]'::jsonb;