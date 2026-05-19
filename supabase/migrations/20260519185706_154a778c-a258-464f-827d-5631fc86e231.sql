ALTER TABLE public.company_features
  ADD COLUMN IF NOT EXISTS assist_enabled boolean NULL;

COMMENT ON COLUMN public.company_features.assist_enabled IS
  'Per-company override for AI Assist email surfaces (sidebar, summaries, draft replies). NULL = inherit tenant default (5thline.co => on, all others => off). TRUE/FALSE = explicit override.';