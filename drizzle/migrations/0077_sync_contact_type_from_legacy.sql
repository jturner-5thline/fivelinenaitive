CREATE OR REPLACE FUNCTION public.contacts_fill_contact_type()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.contact_type := NULLIF(btrim(NEW.contact_type), '');
  IF NEW.contact_type IS NULL AND NULLIF(btrim(NEW.hs_contact_type), '') IS NOT NULL THEN
    NEW.contact_type := btrim(NEW.hs_contact_type);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_contacts_fill_contact_type ON public.contacts;
CREATE TRIGGER trg_contacts_fill_contact_type
BEFORE INSERT OR UPDATE OF contact_type, hs_contact_type ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.contacts_fill_contact_type();

UPDATE public.contacts
SET contact_type = btrim(hs_contact_type)
WHERE org_company_id = 'c4753066-0da9-4d87-8858-7eb1adecd173'
  AND NULLIF(btrim(contact_type), '') IS NULL
  AND NULLIF(btrim(hs_contact_type), '') IS NOT NULL;