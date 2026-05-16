
-- Rules (singleton per company)
CREATE TABLE public.partner_pipeline_rules (
  company_id UUID PRIMARY KEY,
  rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);
ALTER TABLE public.partner_pipeline_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read partner pipeline rules"
  ON public.partner_pipeline_rules FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Allowlisted admins write partner pipeline rules"
  ON public.partner_pipeline_rules FOR ALL TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
    AND lower(coalesce(auth.jwt() ->> 'email','')) IN ('jturner@5thline.co','jmoffitt@5thline.co')
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
    AND lower(coalesce(auth.jwt() ->> 'email','')) IN ('jturner@5thline.co','jmoffitt@5thline.co')
  );

-- Audit log
CREATE TABLE public.partner_pipeline_rules_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by UUID,
  changed_by_email TEXT,
  prev_rules JSONB,
  new_rules JSONB,
  summary TEXT
);
CREATE INDEX idx_partner_rules_audit_company_time
  ON public.partner_pipeline_rules_audit (company_id, changed_at DESC);
ALTER TABLE public.partner_pipeline_rules_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read partner pipeline rules audit"
  ON public.partner_pipeline_rules_audit FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Allowlisted admins append partner pipeline rules audit"
  ON public.partner_pipeline_rules_audit FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
    AND lower(coalesce(auth.jwt() ->> 'email','')) IN ('jturner@5thline.co','jmoffitt@5thline.co')
  );

-- Channel types
CREATE TABLE public.partner_channel_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_partner_channel_types_company ON public.partner_channel_types (company_id, sort_order);
ALTER TABLE public.partner_channel_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read partner channel types"
  ON public.partner_channel_types FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Allowlisted admins mutate partner channel types"
  ON public.partner_channel_types FOR ALL TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
    AND lower(coalesce(auth.jwt() ->> 'email','')) IN ('jturner@5thline.co','jmoffitt@5thline.co')
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
    AND lower(coalesce(auth.jwt() ->> 'email','')) IN ('jturner@5thline.co','jmoffitt@5thline.co')
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_partner_rules_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_partner_pipeline_rules_updated_at
  BEFORE UPDATE ON public.partner_pipeline_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_partner_rules_updated_at();

CREATE TRIGGER trg_partner_channel_types_updated_at
  BEFORE UPDATE ON public.partner_channel_types
  FOR EACH ROW EXECUTE FUNCTION public.set_partner_rules_updated_at();
