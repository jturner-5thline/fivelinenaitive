ALTER TABLE public.company_features
  ADD COLUMN IF NOT EXISTS key_metrics_flex_enabled boolean;