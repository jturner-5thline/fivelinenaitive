-- Add deals_widgets_config column to company_settings for company-wide widget configuration
ALTER TABLE public.company_settings 
ADD COLUMN deals_widgets_config jsonb DEFAULT NULL;

-- Add deals_special_widgets column for special widget toggles
ALTER TABLE public.company_settings 
ADD COLUMN deals_special_widgets jsonb DEFAULT NULL;