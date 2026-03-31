
CREATE TABLE public.cash_flow_imports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  file_name TEXT NOT NULL DEFAULT '',
  daily_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  row_structure JSONB NOT NULL DEFAULT '[]'::jsonb,
  imported_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  imported_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.cash_flow_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view cash flow imports"
ON public.cash_flow_imports FOR SELECT TO authenticated
USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can insert cash flow imports"
ON public.cash_flow_imports FOR INSERT TO authenticated
WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can update cash flow imports"
ON public.cash_flow_imports FOR UPDATE TO authenticated
USING (public.is_company_member(auth.uid(), company_id));

CREATE UNIQUE INDEX cash_flow_imports_company_id_idx ON public.cash_flow_imports(company_id);
