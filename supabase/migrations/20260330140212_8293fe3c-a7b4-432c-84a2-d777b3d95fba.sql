ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS hs_company_name TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS hs_address TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS hs_city TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS hs_state TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS hs_zip TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS hs_country TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS hs_notes_last_updated TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS hs_additional_emails_raw TEXT;