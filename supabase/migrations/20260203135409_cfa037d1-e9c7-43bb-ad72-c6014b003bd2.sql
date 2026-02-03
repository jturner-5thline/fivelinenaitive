-- Add company_url and business_model columns to deals table
ALTER TABLE public.deals 
ADD COLUMN IF NOT EXISTS company_url TEXT,
ADD COLUMN IF NOT EXISTS business_model TEXT;