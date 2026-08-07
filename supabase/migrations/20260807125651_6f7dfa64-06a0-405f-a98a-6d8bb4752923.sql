CREATE OR REPLACE FUNCTION public.claap_link_recording_funding_sources(p_recording_id uuid DEFAULT NULL, p_limit integer DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
BEGIN
  WITH rec AS (
    SELECT r.id, r.org_company_id, public.claap_norm_org_name(r.title) AS norm_title, r.participants
    FROM claap_recordings r
    WHERE (p_recording_id IS NULL OR r.id = p_recording_id)
    ORDER BY r.started_at DESC NULLS LAST
    LIMIT coalesce(p_limit, 1000000)
  ),
  lend AS (
    SELECT l.id AS lender_id, l.company_id, public.claap_norm_org_name(l.name) AS norm_name
    FROM master_lenders l
    WHERE coalesce(l.active, true)
  ),
  attendee_domains AS (
    SELECT DISTINCT r.id AS rid, r.org_company_id,
           lower(split_part(p->>'email', '@', 2)) AS dom
    FROM rec r, jsonb_array_elements(coalesce(r.participants, '[]'::jsonb)) p
    WHERE coalesce(p->>'email','') LIKE '%@%'
  ),
  lender_domains AS (
    SELECT l.id AS lender_id, l.company_id, lower(split_part(l.email,'@',2)) AS dom
      FROM master_lenders l WHERE coalesce(l.email,'') LIKE '%@%'
    UNION
    SELECT l.id, l.company_id,
           regexp_replace(regexp_replace(lower(l.website), '^https?://', ''), '^www\.', '')
      FROM master_lenders l WHERE coalesce(l.website,'') <> ''
    UNION
    SELECT lc.lender_id, l.company_id, lower(split_part(lc.email,'@',2))
      FROM lender_contacts lc
      JOIN master_lenders l ON l.id = lc.lender_id
     WHERE coalesce(lc.email,'') LIKE '%@%'
  ),
  lender_domains_clean AS (
    SELECT lender_id, company_id, split_part(split_part(dom, '/', 1), '?', 1) AS dom
    FROM lender_domains
    WHERE dom IS NOT NULL AND dom <> '' AND dom LIKE '%.%'
      AND dom NOT IN ('gmail.com','yahoo.com','hotmail.com','outlook.com','aol.com','icloud.com','me.com','msn.com','live.com','protonmail.com','gmx.com','comcast.net')
  ),
  domain_matches AS (
    SELECT ad.rid, ld.lender_id, 0.95::numeric AS confidence
    FROM attendee_domains ad
    JOIN lender_domains_clean ld
      ON ld.dom = ad.dom
     AND (ld.company_id IS NULL OR ld.company_id = ad.org_company_id)
  ),
  name_matches AS (
    SELECT r.id AS rid, l.lender_id, 0.70::numeric AS confidence
    FROM rec r
    JOIN lend l
      ON (l.company_id IS NULL OR l.company_id = r.org_company_id)
     AND length(l.norm_name) >= 5
     AND (' ' || r.norm_title || ' ') LIKE ('% ' || l.norm_name || ' %')
    WHERE r.norm_title <> ''
  ),
  all_matches AS (
    SELECT rid, lender_id, max(confidence) AS confidence
    FROM (SELECT * FROM domain_matches UNION ALL SELECT * FROM name_matches) m
    GROUP BY rid, lender_id
  ),
  ins AS (
    INSERT INTO claap_recording_links (recording_id, entity_type, entity_id, link_role, confidence, source)
    SELECT rid, 'lender', lender_id, 'funding_source', confidence, 'auto'
    FROM all_matches
    ON CONFLICT (recording_id, link_role, entity_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::int INTO v_inserted FROM ins;

  RETURN v_inserted;
END;
$$;