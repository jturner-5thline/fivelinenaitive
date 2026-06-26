CREATE OR REPLACE FUNCTION public.search_contacts_fast(
  _search text,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  first_name text,
  last_name text,
  full_name text,
  email text,
  phone_work text,
  phone_mobile text,
  job_title text,
  contact_type text,
  linkedin_url text,
  lifecycle_stage text,
  status text,
  contact_score numeric,
  primary_company_id uuid,
  lead_source text,
  last_activity_date timestamptz,
  last_contact_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  hubspot_contact_id text,
  synced_with_hubspot boolean,
  crm_company_id uuid,
  owner_user_id uuid,
  hs_city text,
  hs_state text,
  hs_industry text,
  hs_contact_status text,
  hs_contact_type text,
  hs_company_name text,
  hs_notes_last_contacted timestamptz,
  hs_hs_email_optout boolean,
  email_domain_normalized text,
  crm_company_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q text := lower(trim(coalesce(_search, '')));
  lim integer := greatest(1, least(coalesce(_limit, 50), 100));
  off integer := greatest(0, coalesce(_offset, 0));
  active_company_id uuid;
  tsq tsquery;
BEGIN
  IF auth.uid() IS NULL OR q = '' THEN
    RETURN;
  END IF;

  SELECT cm.company_id
  INTO active_company_id
  FROM public.company_members cm
  WHERE cm.user_id = auth.uid()
  ORDER BY cm.created_at ASC
  LIMIT 1;

  IF active_company_id IS NULL THEN
    RETURN;
  END IF;

  SELECT to_tsquery('simple', string_agg(token || ':*', ' & '))
  INTO tsq
  FROM regexp_split_to_table(q, '[^a-z0-9]+') AS token
  WHERE token <> '';

  IF length(q) < 3 OR position(' ' IN q) > 0 THEN
    RETURN QUERY
    SELECT
      c.id,
      c.first_name,
      c.last_name,
      c.full_name,
      c.email,
      c.phone_work,
      c.phone_mobile,
      c.job_title,
      c.contact_type,
      c.linkedin_url,
      c.lifecycle_stage,
      c.status,
      c.contact_score,
      c.primary_company_id,
      c.lead_source,
      c.last_activity_date,
      c.last_contact_at,
      c.created_at,
      c.updated_at,
      c.hubspot_contact_id,
      c.synced_with_hubspot,
      c.crm_company_id,
      c.owner_user_id,
      c.hs_city,
      c.hs_state,
      c.hs_industry,
      c.hs_contact_status,
      c.hs_contact_type,
      c.hs_company_name,
      c.hs_notes_last_contacted,
      c.hs_hs_email_optout,
      c.email_domain_normalized,
      cc.name AS crm_company_name
    FROM public.contacts c
    LEFT JOIN public.crm_companies cc ON cc.id = c.crm_company_id AND cc.org_company_id = active_company_id
    WHERE c.org_company_id = active_company_id
      AND tsq IS NOT NULL
      AND to_tsvector('simple', coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'') || ' ' || coalesce(c.email,'') || ' ' || coalesce(c.job_title,'')) @@ tsq
    ORDER BY
      CASE
        WHEN lower(coalesce(c.email, '')) = q THEN 0
        WHEN lower(coalesce(c.full_name, '')) = q THEN 0
        WHEN lower(coalesce(c.full_name, '')) LIKE q || '%' THEN 1
        WHEN lower(coalesce(c.first_name, '')) LIKE q || '%' THEN 2
        WHEN lower(coalesce(c.last_name, '')) LIKE q || '%' THEN 2
        WHEN lower(coalesce(c.email, '')) LIKE q || '%' THEN 3
        ELSE 4
      END,
      c.updated_at DESC NULLS LAST,
      c.created_at DESC
    LIMIT lim OFFSET off;

    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.first_name,
    c.last_name,
    c.full_name,
    c.email,
    c.phone_work,
    c.phone_mobile,
    c.job_title,
    c.contact_type,
    c.linkedin_url,
    c.lifecycle_stage,
    c.status,
    c.contact_score,
    c.primary_company_id,
    c.lead_source,
    c.last_activity_date,
    c.last_contact_at,
    c.created_at,
    c.updated_at,
    c.hubspot_contact_id,
    c.synced_with_hubspot,
    c.crm_company_id,
    c.owner_user_id,
    c.hs_city,
    c.hs_state,
    c.hs_industry,
    c.hs_contact_status,
    c.hs_contact_type,
    c.hs_company_name,
    c.hs_notes_last_contacted,
    c.hs_hs_email_optout,
    c.email_domain_normalized,
    cc.name AS crm_company_name
  FROM public.contacts c
  LEFT JOIN public.crm_companies cc ON cc.id = c.crm_company_id AND cc.org_company_id = active_company_id
  WHERE c.org_company_id = active_company_id
    AND (
      c.full_name ILIKE '%' || q || '%'
      OR c.first_name ILIKE '%' || q || '%'
      OR c.last_name ILIKE '%' || q || '%'
      OR c.email ILIKE '%' || q || '%'
      OR c.job_title ILIKE '%' || q || '%'
    )
  ORDER BY
    CASE
      WHEN lower(coalesce(c.email, '')) = q THEN 0
      WHEN lower(coalesce(c.full_name, '')) = q THEN 0
      WHEN lower(coalesce(c.full_name, '')) LIKE q || '%' THEN 1
      WHEN lower(coalesce(c.first_name, '')) LIKE q || '%' THEN 2
      WHEN lower(coalesce(c.last_name, '')) LIKE q || '%' THEN 2
      WHEN lower(coalesce(c.email, '')) LIKE q || '%' THEN 3
      WHEN lower(coalesce(c.email, '')) LIKE '%@' || q || '%' THEN 4
      WHEN lower(coalesce(c.email, '')) LIKE '%' || q || '%' THEN 5
      WHEN lower(coalesce(c.full_name, '')) LIKE '%' || q || '%' THEN 6
      ELSE 7
    END,
    c.updated_at DESC NULLS LAST,
    c.created_at DESC
  LIMIT lim OFFSET off;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_contacts_fast(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_contacts_fast(text, integer, integer) TO service_role;

DROP FUNCTION IF EXISTS public.search_contacts_fast(uuid, text, integer, integer);