-- Add contact name and contact info columns to deals table
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS contact TEXT;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS contact_info TEXT;