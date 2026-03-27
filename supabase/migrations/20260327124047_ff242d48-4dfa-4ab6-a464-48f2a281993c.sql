
CREATE TABLE public.partner_memo_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  field_changed TEXT NOT NULL,
  old_value TEXT DEFAULT '',
  new_value TEXT DEFAULT '',
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_memo_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can manage partner memo audit logs"
  ON public.partner_memo_audit_log FOR ALL
  USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE INDEX idx_partner_memo_audit_partner ON public.partner_memo_audit_log(partner_id, changed_at DESC);
