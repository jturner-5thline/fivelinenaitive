-- Canonical computed metrics table for deterministic financial calculations
CREATE TABLE public.deal_computed_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id),
  metric_key TEXT NOT NULL,
  metric_label TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  subcategory TEXT,
  period_type TEXT NOT NULL DEFAULT 'month',
  period_label TEXT NOT NULL,
  period_start DATE,
  period_end DATE,
  fiscal_year INTEGER,
  value DOUBLE PRECISION,
  unit_type TEXT NOT NULL DEFAULT 'currency',
  is_actual BOOLEAN DEFAULT true,
  is_projection BOOLEAN DEFAULT false,
  trend_direction TEXT,
  trend_magnitude TEXT,
  is_outlier BOOLEAN DEFAULT false,
  is_missing BOOLEAN DEFAULT false,
  source_file_id UUID REFERENCES public.deal_financial_files(id),
  confidence DOUBLE PRECISION DEFAULT 1.0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(deal_id, metric_key, period_type, period_label)
);

-- Index for fast lookups
CREATE INDEX idx_deal_computed_metrics_deal ON public.deal_computed_metrics(deal_id);
CREATE INDEX idx_deal_computed_metrics_key ON public.deal_computed_metrics(deal_id, metric_key);
CREATE INDEX idx_deal_computed_metrics_category ON public.deal_computed_metrics(deal_id, category);

-- Enable RLS
ALTER TABLE public.deal_computed_metrics ENABLE ROW LEVEL SECURITY;

-- RLS policies: company-scoped access
CREATE POLICY "Users can view metrics for their company deals"
  ON public.deal_computed_metrics FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert metrics for their company deals"
  ON public.deal_computed_metrics FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update metrics for their company deals"
  ON public.deal_computed_metrics FOR UPDATE TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete metrics for their company deals"
  ON public.deal_computed_metrics FOR DELETE TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

-- Cached AI insights table
CREATE TABLE public.deal_financial_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id),
  insight_type TEXT NOT NULL,
  structured_output JSONB NOT NULL DEFAULT '{}'::jsonb,
  prompt_version TEXT DEFAULT '1.0',
  schema_version TEXT DEFAULT '1.0',
  model_used TEXT,
  user_id UUID,
  input_hash TEXT,
  is_stale BOOLEAN DEFAULT false,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(deal_id, insight_type)
);

CREATE INDEX idx_deal_financial_insights_deal ON public.deal_financial_insights(deal_id);

ALTER TABLE public.deal_financial_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view insights for their company deals"
  ON public.deal_financial_insights FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert insights for their company deals"
  ON public.deal_financial_insights FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update insights for their company deals"
  ON public.deal_financial_insights FOR UPDATE TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete insights for their company deals"
  ON public.deal_financial_insights FOR DELETE TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );