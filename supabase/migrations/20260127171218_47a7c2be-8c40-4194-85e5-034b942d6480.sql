-- Add total equity raised field to deal_writeups
ALTER TABLE public.deal_writeups 
ADD COLUMN IF NOT EXISTS total_equity_raised TEXT;