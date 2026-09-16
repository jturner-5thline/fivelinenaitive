-- Shared Business Model / Industries dropdown list, stored per company so the
-- options match for every teammate instead of living in one browser.
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS industry_options jsonb NOT NULL DEFAULT '[]'::jsonb;
