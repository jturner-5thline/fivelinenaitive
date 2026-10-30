CREATE TABLE public.channel_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  crm_company_id UUID NOT NULL REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  stage TEXT NOT NULL DEFAULT 'prospect' CHECK (stage IN ('prospect','nurturing','trial','engaged')),
  owner_user_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, crm_company_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_partners TO authenticated;
GRANT ALL ON public.channel_partners TO service_role;
ALTER TABLE public.channel_partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage channel partners" ON public.channel_partners FOR ALL TO authenticated
  USING (company_id = ANY(public.get_user_company_ids(auth.uid())))
  WITH CHECK (company_id = ANY(public.get_user_company_ids(auth.uid()))
    AND EXISTS (SELECT 1 FROM public.crm_companies c WHERE c.id = crm_company_id AND c.org_company_id = channel_partners.company_id));
CREATE INDEX channel_partners_company_idx ON public.channel_partners(company_id);