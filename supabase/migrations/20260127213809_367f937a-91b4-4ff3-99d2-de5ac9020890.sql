-- Add deal_panel_layout column to company_settings for shared layout preferences
ALTER TABLE public.company_settings 
ADD COLUMN IF NOT EXISTS deal_panel_layout jsonb DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.company_settings.deal_panel_layout IS 'Stores deal detail panel order and visibility preferences shared across all company members';