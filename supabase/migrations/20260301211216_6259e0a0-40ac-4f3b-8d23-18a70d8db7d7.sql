
-- Custom metric definitions with formulas
CREATE TABLE public.custom_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  company_id UUID,
  name TEXT NOT NULL,
  description TEXT,
  formula JSONB NOT NULL DEFAULT '{}',
  result_type TEXT NOT NULL DEFAULT 'number', -- number, currency, percentage
  format_options JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.custom_metrics ENABLE ROW LEVEL SECURITY;

-- Users can manage their own custom metrics
CREATE POLICY "Users can view own custom metrics"
  ON public.custom_metrics FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own custom metrics"
  ON public.custom_metrics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own custom metrics"
  ON public.custom_metrics FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own custom metrics"
  ON public.custom_metrics FOR DELETE
  USING (auth.uid() = user_id);

-- Company members can view shared custom metrics
CREATE POLICY "Company members can view shared metrics"
  ON public.custom_metrics FOR SELECT
  USING (
    company_id IS NOT NULL 
    AND public.is_company_member(auth.uid(), company_id)
  );

-- Timestamp trigger
CREATE TRIGGER update_custom_metrics_updated_at
  BEFORE UPDATE ON public.custom_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
