
CREATE TABLE public.cashflow_sidebar_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cash_in_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

ALTER TABLE public.cashflow_sidebar_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view sidebar data"
  ON public.cashflow_sidebar_data
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Company members can insert sidebar data"
  ON public.cashflow_sidebar_data
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Company members can update sidebar data"
  ON public.cashflow_sidebar_data
  FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()
    )
  );
