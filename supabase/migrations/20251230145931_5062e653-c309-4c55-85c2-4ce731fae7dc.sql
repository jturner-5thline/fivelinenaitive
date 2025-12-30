-- Add flag_notes column to deals table for explaining why a deal is flagged
ALTER TABLE public.deals ADD COLUMN flag_notes text;