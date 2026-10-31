CREATE OR REPLACE FUNCTION public.crm_norm_company_name(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT nullif(
    regexp_replace(
      regexp_replace(
        trim(regexp_replace(regexp_replace(lower(coalesce(p,'')), '&', ' and ', 'g'), '[^a-z0-9]+', ' ', 'g')),
        '^the\s+', ''),
      '(\s+(inc|incorporated|llc|l|lc|ltd|limited|corp|corporation|co|company|plc|lp|llp|pllc|pc|gmbh|sa|ag|bv|pty|group|holdings|holding))+$', ''),
    '')
$$;

CREATE OR REPLACE FUNCTION public.crm_norm_domain(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  WITH s AS (
    SELECT split_part(split_part(regexp_replace(regexp_replace(lower(trim(coalesce(p,''))), '^[a-z]+://', ''), '^www\.', ''), '/', 1), '?', 1) d
  ), t AS (SELECT regexp_replace(split_part(regexp_replace(d, '^.*@', ''), ':', 1), '\.+$', '') d FROM s)
  SELECT CASE WHEN d LIKE '%.%' AND d NOT IN ('gmail.com','yahoo.com','outlook.com','hotmail.com','aol.com','icloud.com','linkedin.com','me.com','live.com','msn.com','protonmail.com')
    THEN d END FROM t
$$;

CREATE OR REPLACE FUNCTION public.find_crm_company_duplicates(p_mode text DEFAULT 'any', p_search text DEFAULT NULL, p_limit int DEFAULT 300)
RETURNS TABLE(group_key text, reason text, id uuid, name text, domain text, industry text, hq_city text, hq_state text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_org uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  SELECT cm.company_id INTO v_org FROM company_members cm WHERE cm.user_id = v_uid ORDER BY cm.created_at LIMIT 1;
  IF v_org IS NULL THEN RETURN; END IF;
  RETURN QUERY
  WITH base AS (
    SELECT c.* FROM crm_companies c WHERE c.org_company_id = v_org
  ), keys AS (
    SELECT 'name:' || crm_norm_company_name(b.name) k, 'name'::text r, b.id FROM base b
      WHERE p_mode IN ('any','name') AND length(crm_norm_company_name(b.name)) >= 2
    UNION
    SELECT 'domain:' || crm_norm_domain(d), 'domain', b.id
      FROM base b, unnest(array_prepend(b.domain, coalesce(b.additional_domains,'{}'))) d
      WHERE p_mode IN ('any','domain') AND crm_norm_domain(d) IS NOT NULL
  ), grp AS (
    SELECT k, r FROM keys GROUP BY k, r HAVING count(DISTINCT keys.id) > 1
  ), matched AS (
    SELECT g.k, g.r FROM grp g
    WHERE p_search IS NULL OR trim(p_search) = '' OR EXISTS (
      SELECT 1 FROM keys k2 JOIN base b2 ON b2.id = k2.id
      WHERE k2.k = g.k AND (b2.name ILIKE '%'||p_search||'%' OR b2.domain ILIKE '%'||p_search||'%'))
    ORDER BY g.k LIMIT p_limit
  )
  SELECT m.k, m.r, b.id, b.name, b.domain, b.industry, b.hq_city, b.hq_state, b.created_at
  FROM matched m JOIN keys k ON k.k = m.k JOIN base b ON b.id = k.id
  ORDER BY m.k, b.created_at;
END $$;

REVOKE ALL ON FUNCTION public.find_crm_company_duplicates(text, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_crm_company_duplicates(text, text, int) TO authenticated;