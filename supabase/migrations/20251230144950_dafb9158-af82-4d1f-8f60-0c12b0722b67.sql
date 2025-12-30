-- Add deal_owner column to deals table
ALTER TABLE public.deals 
ADD COLUMN deal_owner text;