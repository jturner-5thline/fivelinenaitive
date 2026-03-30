CREATE INDEX IF NOT EXISTS idx_crm_companies_domain ON public.crm_companies (lower(domain));
CREATE INDEX IF NOT EXISTS idx_contacts_crm_company_id ON public.contacts (crm_company_id);