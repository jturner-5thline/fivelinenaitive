CREATE OR REPLACE FUNCTION public.contacts_fill_contact_type()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NULLIF(btrim(NEW.contact_type), '') IS NULL
     AND NEW.contact_type IS DISTINCT FROM OLD.contact_type
     AND NEW.hs_contact_type IS NOT DISTINCT FROM OLD.hs_contact_type THEN
    -- Explicit clear by a user: store '' so the legacy HubSpot value is not shown or refilled.
    NEW.contact_type := '';
    RETURN NEW;
  END IF;
  IF NEW.contact_type = '' AND TG_OP = 'UPDATE' AND OLD.contact_type = '' THEN
    RETURN NEW;
  END IF;
  NEW.contact_type := NULLIF(btrim(NEW.contact_type), '');
  IF NEW.contact_type IS NULL AND NULLIF(btrim(NEW.hs_contact_type), '') IS NOT NULL THEN
    NEW.contact_type := btrim(NEW.hs_contact_type);
  END IF;
  RETURN NEW;
END $$;