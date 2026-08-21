CREATE INDEX IF NOT EXISTS idx_contacts_org_fullname_lower
  ON public.contacts (org_company_id, lower(btrim(full_name)));

CREATE INDEX IF NOT EXISTS idx_crm_companies_org_name_lower
  ON public.crm_companies (org_company_id, lower(btrim(name)));

CREATE INDEX IF NOT EXISTS idx_deals_referred_by_contact ON public.deals(referred_by_contact_id);
CREATE INDEX IF NOT EXISTS idx_deals_referred_by_crm_company ON public.deals(referred_by_crm_company_id);