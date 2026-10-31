DROP FUNCTION IF EXISTS public.find_crm_company_duplicates(text, text, int);
CREATE OR REPLACE FUNCTION public.find_crm_company_duplicates(p_org uuid, p_mode text DEFAULT 'any', p_search text DEFAULT NULL, p_limit int DEFAULT 300)
RETURNS TABLE(group_key text, reason text, id uuid, name text, domain text, industry text, hq_city text, hq_state text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  IF NOT (is_5thline_user(v_uid) OR EXISTS (SELECT 1 FROM company_members cm WHERE cm.user_id = v_uid AND cm.company_id = p_org)) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  WITH base AS (
    SELECT c.id, c.name, c.domain, c.additional_domains, c.industry, c.hq_city, c.hq_state, c.created_at
    FROM crm_companies c WHERE c.org_company_id = p_org
  ), keys AS (
    SELECT 'name:' || crm_norm_company_name(b.name) k, 'name'::text r, b.id FROM base b
      WHERE p_mode IN ('any','name') AND length(crm_norm_company_name(b.name)) >= 2
    UNION
    SELECT 'domain:' || crm_norm_domain(d), 'domain', b.id
      FROM base b, unnest(array_prepend(b.domain, coalesce(b.additional_domains,'{}'))) d
      WHERE p_mode IN ('any','domain') AND crm_norm_domain(d) IS NOT NULL
  ), grp AS (
    SELECT keys.k, keys.r FROM keys GROUP BY keys.k, keys.r HAVING count(DISTINCT keys.id) > 1
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
REVOKE ALL ON FUNCTION public.find_crm_company_duplicates(uuid, text, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_crm_company_duplicates(uuid, text, text, int) TO authenticated;