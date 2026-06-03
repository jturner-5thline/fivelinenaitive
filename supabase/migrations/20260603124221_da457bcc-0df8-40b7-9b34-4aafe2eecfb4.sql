ALTER TABLE public.lender_contacts
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lender_contacts_contact_id
  ON public.lender_contacts(contact_id);