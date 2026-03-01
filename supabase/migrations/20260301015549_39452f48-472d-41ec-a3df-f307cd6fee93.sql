
-- Add FPA dashboard configuration column to company_settings
ALTER TABLE public.company_settings
ADD COLUMN IF NOT EXISTS fpa_dashboard_config jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.company_settings.fpa_dashboard_config IS 'Admin-configurable FPA dashboard visibility settings for charts, tabs, and elements';
