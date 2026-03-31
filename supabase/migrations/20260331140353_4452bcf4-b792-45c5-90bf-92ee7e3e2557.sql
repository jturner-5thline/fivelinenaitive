CREATE TABLE public.cashflow_cash_in_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  deal_name TEXT NOT NULL,
  fee_type TEXT NOT NULL CHECK (fee_type IN ('retainer', 'milestone', 'closing')),
  amount NUMERIC NOT NULL DEFAULT 0,
  target_date DATE NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.cashflow_cash_in_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view cash-in items"
  ON public.cashflow_cash_in_items FOR SELECT
  TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can insert cash-in items"
  ON public.cashflow_cash_in_items FOR INSERT
  TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can update cash-in items"
  ON public.cashflow_cash_in_items FOR UPDATE
  TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can delete cash-in items"
  ON public.cashflow_cash_in_items FOR DELETE
  TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));