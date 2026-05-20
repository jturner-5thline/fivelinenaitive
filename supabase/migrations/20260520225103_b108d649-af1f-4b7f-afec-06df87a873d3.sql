
CREATE OR REPLACE FUNCTION public.tg_blount_contact_autolink_company()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  blount_id uuid := 'c4753066-0da9-4d87-8858-7eb1adecd173';
  ids uuid[];
BEGIN
  IF NEW.org_company_id IS DISTINCT FROM blount_id THEN RETURN NEW; END IF;
  IF NEW.crm_company_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.email_domain_normalized IS NULL THEN RETURN NEW; END IF;

  SELECT array_agg(id) INTO ids
  FROM public.crm_companies
  WHERE org_company_id = blount_id
    AND domain_normalized = NEW.email_domain_normalized;

  IF ids IS NOT NULL AND array_length(ids, 1) = 1 THEN
    NEW.crm_company_id := ids[1];
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_blount_company_autolink_contacts()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  blount_id uuid := 'c4753066-0da9-4d87-8858-7eb1adecd173';
  dup_count int;
BEGIN
  IF NEW.org_company_id IS DISTINCT FROM blount_id THEN RETURN NEW; END IF;
  IF NEW.domain_normalized IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.domain_normalized IS NOT DISTINCT FROM OLD.domain_normalized THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO dup_count
  FROM public.crm_companies
  WHERE org_company_id = blount_id
    AND domain_normalized = NEW.domain_normalized
    AND id <> NEW.id;

  IF dup_count = 0 THEN
    UPDATE public.contacts
       SET crm_company_id = NEW.id
     WHERE org_company_id = blount_id
       AND crm_company_id IS NULL
       AND email_domain_normalized = NEW.domain_normalized;
  END IF;
  RETURN NEW;
END;
$$;
