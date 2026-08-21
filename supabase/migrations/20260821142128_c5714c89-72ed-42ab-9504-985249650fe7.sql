ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS referred_by_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referred_by_crm_company_id uuid REFERENCES public.crm_companies(id) ON DELETE SET NULL;