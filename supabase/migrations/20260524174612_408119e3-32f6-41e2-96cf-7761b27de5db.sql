ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_settings   jsonb NOT NULL DEFAULT '{}'::jsonb;