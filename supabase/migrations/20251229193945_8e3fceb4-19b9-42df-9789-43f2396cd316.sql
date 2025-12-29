-- Add exclusivity column to deals table
ALTER TABLE public.deals 
ADD COLUMN exclusivity text;