
-- 1) Add normalized domain columns
ALTER TABLE public.crm_companies ADD COLUMN IF NOT EXISTS domain_normalized text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS email_domain_normalized text;

CREATE INDEX IF NOT EXISTS idx_crm_companies_domain_normalized ON public.crm_companies (org_company_id, domain_normalized);
CREATE INDEX IF NOT EXISTS idx_contacts_email_domain_normalized ON public.contacts (org_company_id, email_domain_normalized);

-- 2) Normalization helpers
CREATE OR REPLACE FUNCTION public.normalize_website_domain(url text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  d text;
BEGIN
  IF url IS NULL THEN RETURN NULL; END IF;
  d := lower(btrim(url));
  IF d = '' THEN RETURN NULL; END IF;
  d := regexp_replace(d, '^https?://', '');
  d := regexp_replace(d, '^www\.', '');
  d := split_part(d, '/', 1);
  d := split_part(d, '?', 1);
  d := split_part(d, '#', 1);
  d := btrim(d);
  IF d = '' OR position('.' in d) = 0 THEN RETURN NULL; END IF;
  RETURN d;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_email_domain(em text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  d text;
  free_providers text[] := ARRAY['gmail.com','googlemail.com','yahoo.com','yahoo.co.uk','hotmail.com','outlook.com','live.com','msn.com','aol.com','icloud.com','me.com','mac.com','mail.com','protonmail.com','proton.me','gmx.com','gmx.net','yandex.com','zoho.com'];
BEGIN
  IF em IS NULL THEN RETURN NULL; END IF;
  d := lower(btrim(em));
  IF position('@' in d) = 0 THEN RETURN NULL; END IF;
  d := split_part(d, '@', 2);
  d := btrim(d);
  IF d = '' OR position('.' in d) = 0 OR position(' ' in d) > 0 THEN RETURN NULL; END IF;
  IF d = ANY(free_providers) THEN RETURN NULL; END IF;
  RETURN d;
END;
$$;

-- 3) Triggers to maintain normalized columns
CREATE OR REPLACE FUNCTION public.tg_crm_companies_set_domain_normalized()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.domain_normalized := COALESCE(
    public.normalize_website_domain(NEW.website_url),
    public.normalize_website_domain(NEW.domain)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_companies_domain_normalized ON public.crm_companies;
CREATE TRIGGER trg_crm_companies_domain_normalized
BEFORE INSERT OR UPDATE OF website_url, domain ON public.crm_companies
FOR EACH ROW EXECUTE FUNCTION public.tg_crm_companies_set_domain_normalized();

CREATE OR REPLACE FUNCTION public.tg_contacts_set_email_domain_normalized()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.email_domain_normalized := public.normalize_email_domain(NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contacts_email_domain_normalized ON public.contacts;
CREATE TRIGGER trg_contacts_email_domain_normalized
BEFORE INSERT OR UPDATE OF email ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.tg_contacts_set_email_domain_normalized();

-- 4) Auto-link triggers scoped to Blount Capital workspace only
CREATE OR REPLACE FUNCTION public.tg_blount_contact_autolink_company()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  blount_id uuid := 'c4753066-0da9-4d87-8858-7eb1adecd173';
  match_count int;
  match_id uuid;
BEGIN
  IF NEW.org_company_id IS DISTINCT FROM blount_id THEN RETURN NEW; END IF;
  IF NEW.crm_company_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.email_domain_normalized IS NULL THEN RETURN NEW; END IF;

  SELECT count(*), min(id) INTO match_count, match_id
  FROM public.crm_companies
  WHERE org_company_id = blount_id
    AND domain_normalized = NEW.email_domain_normalized;

  IF match_count = 1 THEN
    NEW.crm_company_id := match_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_blount_contact_autolink ON public.contacts;
CREATE TRIGGER trg_blount_contact_autolink
BEFORE INSERT OR UPDATE OF email, email_domain_normalized, org_company_id ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.tg_blount_contact_autolink_company();

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

DROP TRIGGER IF EXISTS trg_blount_company_autolink ON public.crm_companies;
CREATE TRIGGER trg_blount_company_autolink
AFTER INSERT OR UPDATE OF website_url, domain, domain_normalized, org_company_id ON public.crm_companies
FOR EACH ROW EXECUTE FUNCTION public.tg_blount_company_autolink_contacts();
