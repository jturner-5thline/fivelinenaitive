
-- AI Configuration table for company-level AI settings
CREATE TABLE public.ai_configuration (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  default_model TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  default_temperature NUMERIC NOT NULL DEFAULT 0.7,
  max_tokens INTEGER NOT NULL DEFAULT 4096,
  features_enabled JSONB NOT NULL DEFAULT '{"chat": true, "financial_analysis": true, "agents": true, "workflows": true}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

-- AI Usage Logs for tracking token usage by feature
CREATE TABLE public.ai_usage_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  feature TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_configuration ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for ai_configuration
CREATE POLICY "Company members can view AI config"
  ON public.ai_configuration FOR SELECT
  TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company admins can update AI config"
  ON public.ai_configuration FOR UPDATE
  TO authenticated
  USING (public.is_company_admin(auth.uid(), company_id));

CREATE POLICY "Company admins can insert AI config"
  ON public.ai_configuration FOR INSERT
  TO authenticated
  WITH CHECK (public.is_company_admin(auth.uid(), company_id));

-- RLS policies for ai_usage_logs
CREATE POLICY "Company members can view usage logs"
  ON public.ai_usage_logs FOR SELECT
  TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Authenticated users can insert usage logs"
  ON public.ai_usage_logs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

-- Index for usage queries
CREATE INDEX idx_ai_usage_logs_company_feature ON public.ai_usage_logs(company_id, feature, created_at);
