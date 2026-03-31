
CREATE TABLE public.duplicate_deal_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  suppression_key TEXT NOT NULL,
  deal_ids UUID[] NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, suppression_key)
);

ALTER TABLE public.duplicate_deal_suppressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company suppressions"
  ON public.duplicate_deal_suppressions
  FOR SELECT
  TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Users can create suppressions for own company"
  ON public.duplicate_deal_suppressions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id) AND created_by = auth.uid());

CREATE POLICY "Users can delete own suppressions"
  ON public.duplicate_deal_suppressions
  FOR DELETE
  TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));
