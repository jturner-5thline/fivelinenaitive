-- Add notes column to deals table to persist current status note
ALTER TABLE public.deals 
ADD COLUMN IF NOT EXISTS notes text;