
CREATE OR REPLACE FUNCTION public.validate_contact_owner_company()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.owner_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.org_company_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE user_id = NEW.owner_user_id
      AND company_id = NEW.org_company_id
  ) THEN
    RAISE EXCEPTION 'Contact owner % is not a member of company %', NEW.owner_user_id, NEW.org_company_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_contact_owner_company ON public.contacts;
CREATE TRIGGER trg_validate_contact_owner_company
BEFORE INSERT OR UPDATE OF owner_user_id, org_company_id ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.validate_contact_owner_company();

CREATE INDEX IF NOT EXISTS idx_contacts_owner_user_id
ON public.contacts (org_company_id, owner_user_id);
