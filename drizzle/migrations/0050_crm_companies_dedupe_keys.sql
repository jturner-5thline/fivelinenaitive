ALTER TABLE public.crm_companies
  ADD COLUMN IF NOT EXISTS dedupe_name text GENERATED ALWAYS AS (public.crm_norm_company_name(name)) STORED,
  ADD COLUMN IF NOT EXISTS dedupe_domain text GENERATED ALWAYS AS (public.crm_norm_domain(domain)) STORED;
CREATE INDEX IF NOT EXISTS idx_crm_companies_org_dedupe_name ON public.crm_companies (org_company_id, dedupe_name);
CREATE INDEX IF NOT EXISTS idx_crm_companies_org_dedupe_domain ON public.crm_companies (org_company_id, dedupe_domain);

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
  WITH keys AS (
    SELECT 'name:' || c.dedupe_name k, 'name'::text r, c.id FROM crm_companies c
      WHERE p_mode IN ('any','name') AND c.org_company_id = p_org AND length(c.dedupe_name) >= 2
    UNION ALL
    SELECT 'domain:' || c.dedupe_domain, 'domain', c.id FROM crm_companies c
      WHERE p_mode IN ('any','domain') AND c.org_company_id = p_org AND c.dedupe_domain IS NOT NULL
    UNION ALL
    SELECT DISTINCT 'domain:' || crm_norm_domain(d), 'domain', c.id
      FROM crm_companies c, unnest(c.additional_domains) d
      WHERE p_mode IN ('any','domain') AND c.org_company_id = p_org AND cardinality(c.additional_domains) > 0
        AND crm_norm_domain(d) IS NOT NULL AND crm_norm_domain(d) IS DISTINCT FROM c.dedupe_domain
  ), grp AS (
    SELECT keys.k, min(keys.r) r FROM keys GROUP BY keys.k HAVING count(DISTINCT keys.id) > 1
  ), matched AS (
    SELECT g.k, g.r FROM grp g
    WHERE p_search IS NULL OR trim(p_search) = '' OR EXISTS (
      SELECT 1 FROM keys k2 JOIN crm_companies b2 ON b2.id = k2.id
      WHERE k2.k = g.k AND (b2.name ILIKE '%'||p_search||'%' OR b2.domain ILIKE '%'||p_search||'%'))
    ORDER BY g.k LIMIT p_limit
  )
  SELECT DISTINCT ON (m.k, b.id) m.k, m.r, b.id, b.name, b.domain, b.industry, b.hq_city, b.hq_state, b.created_at
  FROM matched m JOIN keys k ON k.k = m.k JOIN crm_companies b ON b.id = k.id
  ORDER BY m.k, b.id;
END $$;