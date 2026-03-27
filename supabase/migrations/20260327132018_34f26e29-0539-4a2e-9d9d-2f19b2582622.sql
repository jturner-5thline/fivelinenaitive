
-- Partner-Company junction table
CREATE TABLE public.partner_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(partner_id, company_id)
);

ALTER TABLE public.partner_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partner_companies_select" ON public.partner_companies FOR SELECT TO authenticated
  USING (partner_id IN (SELECT id FROM public.partners WHERE company_id = ANY(public.get_user_company_ids(auth.uid()))));

CREATE POLICY "partner_companies_insert" ON public.partner_companies FOR INSERT TO authenticated
  WITH CHECK (partner_id IN (SELECT id FROM public.partners WHERE company_id = ANY(public.get_user_company_ids(auth.uid()))));

CREATE POLICY "partner_companies_delete" ON public.partner_companies FOR DELETE TO authenticated
  USING (partner_id IN (SELECT id FROM public.partners WHERE company_id = ANY(public.get_user_company_ids(auth.uid()))));

-- Partner-Contact junction table
CREATE TABLE public.partner_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(partner_id, contact_id)
);

ALTER TABLE public.partner_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partner_contacts_select" ON public.partner_contacts FOR SELECT TO authenticated
  USING (partner_id IN (SELECT id FROM public.partners WHERE company_id = ANY(public.get_user_company_ids(auth.uid()))));

CREATE POLICY "partner_contacts_insert" ON public.partner_contacts FOR INSERT TO authenticated
  WITH CHECK (partner_id IN (SELECT id FROM public.partners WHERE company_id = ANY(public.get_user_company_ids(auth.uid()))));

CREATE POLICY "partner_contacts_delete" ON public.partner_contacts FOR DELETE TO authenticated
  USING (partner_id IN (SELECT id FROM public.partners WHERE company_id = ANY(public.get_user_company_ids(auth.uid()))));
