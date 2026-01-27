-- Add deal_stages column to company_settings to persist stages across environments
ALTER TABLE public.company_settings 
ADD COLUMN IF NOT EXISTS deal_stages JSONB DEFAULT NULL;