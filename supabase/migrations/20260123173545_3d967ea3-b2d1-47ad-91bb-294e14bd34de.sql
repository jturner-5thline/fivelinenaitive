-- Add year_founded column to deal_writeups table
ALTER TABLE public.deal_writeups 
ADD COLUMN IF NOT EXISTS year_founded TEXT;