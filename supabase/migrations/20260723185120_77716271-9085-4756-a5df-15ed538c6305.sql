
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS deals_hidden_widget_metrics jsonb NOT NULL DEFAULT '[]'::jsonb;
