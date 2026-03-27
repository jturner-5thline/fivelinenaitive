
CREATE TABLE public.partner_memo_read_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  last_seen_audit_id uuid REFERENCES public.partner_memo_audit_log(id) ON DELETE SET NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, user_id)
);

ALTER TABLE public.partner_memo_read_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own read receipts"
  ON public.partner_memo_read_receipts
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid() AND company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()))
  WITH CHECK (user_id = auth.uid() AND company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE INDEX idx_partner_memo_read_receipts_partner ON public.partner_memo_read_receipts(partner_id, user_id);
