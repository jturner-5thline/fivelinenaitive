CREATE TABLE public.deal_status_report_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL UNIQUE REFERENCES public.deals(id) ON DELETE CASCADE,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_status_report_drafts TO authenticated;
GRANT ALL ON public.deal_status_report_drafts TO service_role;

ALTER TABLE public.deal_status_report_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deal members can view status report drafts"
ON public.deal_status_report_drafts FOR SELECT TO authenticated
USING (public.can_access_deal(auth.uid(), deal_id));

CREATE POLICY "Deal members can create status report drafts"
ON public.deal_status_report_drafts FOR INSERT TO authenticated
WITH CHECK (public.can_access_deal(auth.uid(), deal_id));

CREATE POLICY "Deal members can update status report drafts"
ON public.deal_status_report_drafts FOR UPDATE TO authenticated
USING (public.can_access_deal(auth.uid(), deal_id))
WITH CHECK (public.can_access_deal(auth.uid(), deal_id));

CREATE POLICY "Deal members can delete status report drafts"
ON public.deal_status_report_drafts FOR DELETE TO authenticated
USING (public.can_access_deal(auth.uid(), deal_id));

CREATE TRIGGER update_deal_status_report_drafts_updated_at
BEFORE UPDATE ON public.deal_status_report_drafts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();