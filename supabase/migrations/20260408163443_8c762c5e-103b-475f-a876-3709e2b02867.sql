
CREATE TABLE public.computed_kpis (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  metric_key TEXT NOT NULL,
  metric_value NUMERIC,
  numerator_value NUMERIC,
  denominator_value NUMERIC,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'fresh',
  error_message TEXT,
  last_refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, metric_key)
);

ALTER TABLE public.computed_kpis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view their KPIs"
ON public.computed_kpis
FOR SELECT
TO authenticated
USING (public.is_company_member(auth.uid(), company_id));

CREATE TRIGGER update_computed_kpis_updated_at
BEFORE UPDATE ON public.computed_kpis
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
