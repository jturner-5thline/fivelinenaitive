CREATE TABLE public.contact_tagging_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT,
  match_field TEXT NOT NULL DEFAULT 'domain',
  match_operator TEXT NOT NULL DEFAULT 'is',
  match_value TEXT NOT NULL,
  tag TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 100,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contact_tagging_rules_field_chk CHECK (match_field IN ('domain','email')),
  CONSTRAINT contact_tagging_rules_op_chk CHECK (match_operator IN ('is','contains'))
);

CREATE INDEX idx_contact_tagging_rules_company ON public.contact_tagging_rules(company_id, is_active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_tagging_rules TO authenticated;
GRANT ALL ON public.contact_tagging_rules TO service_role;

ALTER TABLE public.contact_tagging_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view tagging rules"
ON public.contact_tagging_rules FOR SELECT TO authenticated
USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Members can create tagging rules"
ON public.contact_tagging_rules FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Members can update tagging rules"
ON public.contact_tagging_rules FOR UPDATE TO authenticated
USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()))
WITH CHECK (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Members can delete tagging rules"
ON public.contact_tagging_rules FOR DELETE TO authenticated
USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE TRIGGER update_contact_tagging_rules_updated_at
BEFORE UPDATE ON public.contact_tagging_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();