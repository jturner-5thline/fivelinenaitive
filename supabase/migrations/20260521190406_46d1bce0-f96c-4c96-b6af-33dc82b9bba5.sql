
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.find_entity(
  _type text,
  _query text,
  _limit int DEFAULT 3
)
RETURNS TABLE (
  id uuid,
  display_name text,
  confidence numeric,
  subtitle text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _q text := COALESCE(trim(_query), '');
  _company_id uuid;
BEGIN
  IF _q = '' THEN
    RETURN;
  END IF;

  _company_id := public.get_user_company_id(auth.uid());

  IF _type = 'deal' THEN
    RETURN QUERY
    SELECT d.id,
           d.company AS display_name,
           GREATEST(
             similarity(lower(d.company), lower(_q)),
             CASE WHEN lower(d.company) ILIKE '%' || lower(_q) || '%' THEN 0.65 ELSE 0 END,
             CASE WHEN lower(d.company) = lower(_q) THEN 1.0 ELSE 0 END
           )::numeric AS confidence,
           COALESCE(d.stage, '') || CASE WHEN d.status IS NOT NULL THEN ' • ' || d.status ELSE '' END AS subtitle
    FROM public.deals d
    WHERE (
            d.company ILIKE '%' || _q || '%'
            OR similarity(lower(d.company), lower(_q)) > 0.25
          )
      AND d.company NOT ILIKE 'test %'
      AND d.company NOT IN ('Test-Niki''s Store', 'Example Deal')
      AND (
        _company_id IS NULL
        OR d.user_id IN (
          SELECT cm.user_id FROM public.company_members cm WHERE cm.company_id = _company_id
        )
      )
    ORDER BY confidence DESC, d.updated_at DESC NULLS LAST
    LIMIT _limit;

  ELSIF _type = 'user' THEN
    RETURN QUERY
    SELECT p.user_id AS id,
           COALESCE(p.display_name, p.company_name, '') AS display_name,
           GREATEST(
             similarity(lower(COALESCE(p.display_name, '')), lower(_q)),
             CASE WHEN lower(COALESCE(p.display_name, '')) ILIKE '%' || lower(_q) || '%' THEN 0.65 ELSE 0 END,
             CASE WHEN lower(COALESCE(p.display_name, '')) = lower(_q) THEN 1.0 ELSE 0 END
           )::numeric AS confidence,
           COALESCE(p.company_role, '') AS subtitle
    FROM public.profiles p
    WHERE (
            COALESCE(p.display_name, '') ILIKE '%' || _q || '%'
            OR similarity(lower(COALESCE(p.display_name, '')), lower(_q)) > 0.25
          )
      AND (
        _company_id IS NULL
        OR p.user_id IN (
          SELECT cm.user_id FROM public.company_members cm WHERE cm.company_id = _company_id
        )
      )
    ORDER BY confidence DESC
    LIMIT _limit;

  ELSIF _type = 'company' THEN
    RETURN QUERY
    SELECT c.id,
           c.name AS display_name,
           GREATEST(
             similarity(lower(c.name), lower(_q)),
             CASE WHEN lower(c.name) ILIKE '%' || lower(_q) || '%' THEN 0.65 ELSE 0 END,
             CASE WHEN lower(c.name) = lower(_q) THEN 1.0 ELSE 0 END
           )::numeric AS confidence,
           COALESCE(c.industry, '') AS subtitle
    FROM public.crm_companies c
    WHERE (
            c.name ILIKE '%' || _q || '%'
            OR similarity(lower(c.name), lower(_q)) > 0.25
          )
      AND (_company_id IS NULL OR c.org_company_id = _company_id)
    ORDER BY confidence DESC
    LIMIT _limit;

  ELSIF _type = 'contact' THEN
    RETURN QUERY
    SELECT ct.id,
           COALESCE(ct.full_name, trim(COALESCE(ct.first_name, '') || ' ' || COALESCE(ct.last_name, ''))) AS display_name,
           GREATEST(
             similarity(lower(COALESCE(ct.full_name, '') || ' ' || COALESCE(ct.email, '')), lower(_q)),
             CASE WHEN COALESCE(ct.full_name, '') ILIKE '%' || _q || '%' OR COALESCE(ct.email, '') ILIKE '%' || _q || '%' THEN 0.65 ELSE 0 END,
             CASE WHEN lower(COALESCE(ct.full_name, '')) = lower(_q) OR lower(COALESCE(ct.email, '')) = lower(_q) THEN 1.0 ELSE 0 END
           )::numeric AS confidence,
           COALESCE(ct.email, '') AS subtitle
    FROM public.contacts ct
    WHERE (
            COALESCE(ct.full_name, '') ILIKE '%' || _q || '%'
            OR COALESCE(ct.email, '') ILIKE '%' || _q || '%'
            OR similarity(lower(COALESCE(ct.full_name, '')), lower(_q)) > 0.25
          )
      AND (_company_id IS NULL OR ct.org_company_id = _company_id)
    ORDER BY confidence DESC
    LIMIT _limit;

  ELSE
    RAISE EXCEPTION 'Unknown entity type: %', _type
      USING HINT = 'Must be one of: deal, user, company, contact';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.find_entity(text, text, int) FROM public;
GRANT EXECUTE ON FUNCTION public.find_entity(text, text, int) TO authenticated;
