
-- Add crm_company_id to deals table (FK to crm_companies)
ALTER TABLE public.deals 
  ADD COLUMN IF NOT EXISTS crm_company_id uuid REFERENCES public.crm_companies(id) ON DELETE SET NULL;

-- Add index on the new FK
CREATE INDEX IF NOT EXISTS idx_deals_crm_company_id ON public.deals(crm_company_id);

-- Add index on contacts.crm_company_id if not exists
CREATE INDEX IF NOT EXISTS idx_contacts_crm_company_id ON public.contacts(crm_company_id);

-- Add index on contact_deals FKs if not exist
CREATE INDEX IF NOT EXISTS idx_contact_deals_contact_id ON public.contact_deals(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_deals_deal_id ON public.contact_deals(deal_id);
