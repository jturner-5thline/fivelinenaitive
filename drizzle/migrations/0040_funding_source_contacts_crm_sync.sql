CREATE OR REPLACE FUNCTION public.fn_lender_contact_resolve_crm(_lender_id uuid, _name text, _email text, _title text, _phone text, _city text, _state text, _country text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l record; org uuid; crm uuid; cid uuid; em text := nullif(lower(trim(_email)),''); nm text := nullif(trim(_name),'');
  parts text[];
BEGIN
  SELECT id, name, website, crm_company_id, company_id, user_id INTO l FROM master_lenders WHERE id = _lender_id;
  IF l.id IS NULL OR l.company_id IS NULL OR (nm IS NULL AND em IS NULL) THEN RETURN NULL; END IF;
  org := l.company_id;
  IF l.crm_company_id IS NOT NULL THEN
    SELECT id INTO crm FROM crm_companies WHERE id = l.crm_company_id AND org_company_id = org;
  END IF;
  IF crm IS NULL AND nullif(trim(l.name),'') IS NOT NULL THEN
    SELECT id INTO crm FROM crm_companies WHERE org_company_id = org AND lower(trim(name)) = lower(trim(l.name)) ORDER BY created_at LIMIT 1;
    IF crm IS NULL THEN
      INSERT INTO crm_companies (name, domain, created_by, org_company_id)
      VALUES (trim(l.name), nullif(split_part(regexp_replace(lower(coalesce(l.website,'')), '^(https?://)?(www\.)?', ''), '/', 1),''), l.user_id, org)
      RETURNING id INTO crm;
    END IF;
    IF l.crm_company_id IS NULL THEN UPDATE master_lenders SET crm_company_id = crm WHERE id = l.id; END IF;
  END IF;
  IF em IS NOT NULL THEN
    SELECT id INTO cid FROM contacts WHERE org_company_id = org AND lower(trim(email)) = em ORDER BY created_at LIMIT 1;
  ELSE
    SELECT CASE WHEN count(*) = 1 THEN min(id::text)::uuid END INTO cid FROM contacts WHERE org_company_id = org AND lower(trim(full_name)) = lower(nm);
  END IF;
  IF cid IS NOT NULL THEN
    UPDATE contacts SET crm_company_id = coalesce(crm_company_id, crm), job_title = coalesce(job_title, nullif(trim(_title),''))
    WHERE id = cid AND (crm_company_id IS NULL OR job_title IS NULL);
    RETURN cid;
  END IF;
  nm := coalesce(nm, em);
  parts := regexp_split_to_array(nm, '\s+');
  INSERT INTO contacts (first_name, last_name, email, phone_work, job_title, city, state, state_region, country, crm_company_id, org_company_id, created_by, lead_source)
  VALUES (parts[1], nullif(array_to_string(parts[2:], ' '),''), em, nullif(trim(_phone),''), nullif(trim(_title),''),
          nullif(trim(_city),''), nullif(trim(_state),''), nullif(trim(_state),''), nullif(trim(_country),''), crm, org, l.user_id, 'Funding Source')
  RETURNING id INTO cid;
  RETURN cid;
END $$;
REVOKE ALL ON FUNCTION public.fn_lender_contact_resolve_crm(uuid,text,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tg_lender_contacts_sync_crm()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.contact_id IS NULL THEN
    BEGIN
      NEW.contact_id := public.fn_lender_contact_resolve_crm(NEW.lender_id, NEW.name, NEW.email, NEW.title, NEW.phone, NEW.city, NEW.state, NEW.country);
    EXCEPTION WHEN others THEN
      RAISE WARNING 'lender contact CRM sync failed for %: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_lender_contacts_sync_crm ON public.lender_contacts;
CREATE TRIGGER trg_lender_contacts_sync_crm BEFORE INSERT OR UPDATE ON public.lender_contacts
FOR EACH ROW EXECUTE FUNCTION public.tg_lender_contacts_sync_crm();

CREATE OR REPLACE FUNCTION public.tg_master_lenders_primary_contact()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE nm text := nullif(trim(NEW.contact_name),''); em text := nullif(trim(NEW.email),'');
BEGIN
  IF NEW.company_id IS NULL OR (nm IS NULL AND em IS NULL) THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.contact_name IS NOT DISTINCT FROM OLD.contact_name AND NEW.email IS NOT DISTINCT FROM OLD.email THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM lender_contacts c WHERE c.lender_id = NEW.id AND
       CASE WHEN em IS NOT NULL THEN lower(trim(c.email)) = lower(em) ELSE lower(trim(c.name)) = lower(nm) END) THEN
    INSERT INTO lender_contacts (lender_id, name, email, title, phone, geography, is_primary)
    VALUES (NEW.id, coalesce(nm, em), em, NEW.contact_title, NEW.contact_phone, NEW.contact_geography,
            NOT EXISTS (SELECT 1 FROM lender_contacts c WHERE c.lender_id = NEW.id AND c.is_primary));
  END IF;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'primary contact sync failed for lender %: %', NEW.id, SQLERRM;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_master_lenders_primary_contact ON public.master_lenders;
CREATE TRIGGER trg_master_lenders_primary_contact AFTER INSERT OR UPDATE OF contact_name, email ON public.master_lenders
FOR EACH ROW EXECUTE FUNCTION public.tg_master_lenders_primary_contact();