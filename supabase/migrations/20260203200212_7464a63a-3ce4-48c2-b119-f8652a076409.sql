-- Add sponsorship column to deal_writeups for lender matching criteria
ALTER TABLE public.deal_writeups 
ADD COLUMN IF NOT EXISTS sponsorship TEXT;