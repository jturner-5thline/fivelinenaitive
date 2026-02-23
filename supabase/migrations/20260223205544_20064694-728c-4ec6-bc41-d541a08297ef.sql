
-- Add deal_info_layout column to company_settings for storing deal information card field order and visibility
ALTER TABLE public.company_settings
ADD COLUMN IF NOT EXISTS deal_info_layout jsonb DEFAULT NULL;

COMMENT ON COLUMN public.company_settings.deal_info_layout IS 'Stores the order and visibility configuration for fields in the Deal Information card';
