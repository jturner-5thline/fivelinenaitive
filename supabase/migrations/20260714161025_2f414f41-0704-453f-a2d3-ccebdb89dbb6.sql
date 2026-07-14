UPDATE public.crm_companies
SET domain = regexp_replace(
    regexp_replace(trim(website_url), '^https?://', '', 'i'),
    '/.*$', ''
  )
WHERE (domain IS NULL OR btrim(domain) = '')
  AND website_url IS NOT NULL
  AND btrim(website_url) <> '';

DROP TRIGGER IF EXISTS trg_crm_companies_domain_normalized ON public.crm_companies;

CREATE OR REPLACE FUNCTION public.tg_crm_companies_set_domain_normalized()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.domain_normalized := public.normalize_website_domain(NEW.domain);
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_crm_companies_domain_normalized
BEFORE INSERT OR UPDATE OF domain ON public.crm_companies
FOR EACH ROW EXECUTE FUNCTION public.tg_crm_companies_set_domain_normalized();

ALTER TABLE public.crm_companies DROP COLUMN IF EXISTS website_url;