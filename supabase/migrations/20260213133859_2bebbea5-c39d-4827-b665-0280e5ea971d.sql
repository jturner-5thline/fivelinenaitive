-- Add team column to deal_writeups table
ALTER TABLE public.deal_writeups 
ADD COLUMN team JSONB DEFAULT '[]'::jsonb;