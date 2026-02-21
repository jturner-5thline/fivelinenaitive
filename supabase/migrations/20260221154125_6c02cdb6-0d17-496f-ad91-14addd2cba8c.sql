
-- Table to track dismissed lender history warnings per deal
CREATE TABLE public.lender_history_warning_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  lender_name TEXT NOT NULL,
  dismissed_by UUID NOT NULL,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(deal_id, lender_name)
);

ALTER TABLE public.lender_history_warning_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view dismissals" ON public.lender_history_warning_dismissals
  FOR SELECT TO authenticated
  USING (
    deal_id IN (SELECT id FROM public.deals WHERE company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    ))
  );

CREATE POLICY "Authenticated users can dismiss warnings" ON public.lender_history_warning_dismissals
  FOR INSERT TO authenticated
  WITH CHECK (dismissed_by = auth.uid());

CREATE POLICY "Users can delete own dismissals" ON public.lender_history_warning_dismissals
  FOR DELETE TO authenticated
  USING (dismissed_by = auth.uid());

CREATE INDEX idx_lender_warning_dismissals_deal ON public.lender_history_warning_dismissals(deal_id, lender_name);
