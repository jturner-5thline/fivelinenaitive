CREATE TABLE public.pending_lender_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lender_id UUID REFERENCES public.deal_lenders(id) ON DELETE SET NULL,
  lender_name TEXT NOT NULL,
  change_summary JSONB NOT NULL DEFAULT '{}',
  changed_by UUID,
  changed_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pending_lender_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert pending lender notifications"
  ON public.pending_lender_notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can read pending lender notifications for their company"
  ON public.pending_lender_notifications
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE INDEX idx_pending_lender_notifications_created_at ON public.pending_lender_notifications(created_at);
CREATE INDEX idx_pending_lender_notifications_deal_id ON public.pending_lender_notifications(deal_id);