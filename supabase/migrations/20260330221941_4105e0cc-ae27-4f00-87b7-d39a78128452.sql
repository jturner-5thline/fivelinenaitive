
-- Fix search_lenders_keyword to scope by company (prevent cross-tenant leaks)
-- Add _user_id parameter to filter by company membership
CREATE OR REPLACE FUNCTION public.search_lenders_keyword(
  _search_query text,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
)
RETURNS TABLE(lender_id uuid, relevance_score double precision, total_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  search_terms text[];
  ts_query tsquery;
  term text;
  cleaned text;
  _company_ids uuid[];
BEGIN
  -- Get the calling user's company IDs for tenant isolation
  _company_ids := public.get_user_company_ids(auth.uid());

  cleaned := regexp_replace(lower(trim(_search_query)), '[^a-z0-9\s]', ' ', 'g');
  cleaned := regexp_replace(cleaned, '\s+', ' ', 'g');
  search_terms := string_to_array(trim(cleaned), ' ');
  search_terms := array_remove(search_terms, '');

  IF array_length(search_terms, 1) IS NULL OR array_length(search_terms, 1) = 0 THEN
    RETURN;
  END IF;

  ts_query := to_tsquery('simple', array_to_string(search_terms, ' & '));

  RETURN QUERY
  WITH lender_profile_search AS (
    SELECT
      ml.id AS lid,
      CASE WHEN lower(ml.name) = lower(_search_query) THEN 100.0
           WHEN lower(ml.name) LIKE lower(_search_query) || '%' THEN 50.0
           ELSE 0.0 END
      +
      COALESCE(
        ts_rank_cd(
          to_tsvector('simple',
            coalesce(ml.name, '') || ' ' ||
            coalesce(ml.contact_name, '') || ' ' ||
            coalesce(ml.email, '') || ' ' ||
            coalesce(ml.lender_type, '') || ' ' ||
            coalesce(ml.geo, '') || ' ' ||
            coalesce(ml.tier, '') || ' ' ||
            coalesce(ml.company_requirements, '') || ' ' ||
            coalesce(ml.deal_structure_notes, '') || ' ' ||
            coalesce(ml.b2b_b2c, '') || ' ' ||
            coalesce(ml.sponsorship, '') || ' ' ||
            coalesce(ml.cash_burn, '') || ' ' ||
            coalesce(ml.sub_debt, '') || ' ' ||
            coalesce(ml.refinancing, '') || ' ' ||
            coalesce(ml.relationship_owners, '') || ' ' ||
            coalesce(array_to_string(ml.loan_types, ' '), '') || ' ' ||
            coalesce(array_to_string(ml.industries, ' '), '') || ' ' ||
            coalesce(array_to_string(ml.industries_to_avoid, ' '), '')
          ),
          ts_query
        ), 0.0) AS score
    FROM master_lenders ml
    WHERE ml.company_id = ANY(_company_ids)
  ),
  lender_ilike_search AS (
    SELECT
      ml.id AS lid,
      (
        SELECT COALESCE(SUM(
          CASE
            WHEN ml.name ILIKE '%' || t.term || '%' THEN 8.0
            WHEN ml.contact_name ILIKE '%' || t.term || '%' THEN 6.0
            WHEN ml.email ILIKE '%' || t.term || '%' THEN 5.0
            WHEN ml.lender_type ILIKE '%' || t.term || '%' THEN 4.0
            WHEN ml.geo ILIKE '%' || t.term || '%' THEN 3.0
            WHEN ml.tier ILIKE '%' || t.term || '%' THEN 3.0
            WHEN ml.relationship_owners ILIKE '%' || t.term || '%' THEN 2.0
            ELSE 0.0
          END
        ), 0.0)
        FROM unnest(search_terms) t(term)
      ) AS score
    FROM master_lenders ml
    WHERE ml.company_id = ANY(_company_ids)
  ),
  deal_history_search AS (
    SELECT
      dl.master_lender_id AS lid,
      COUNT(DISTINCT dl.id)::double precision * 3.0 AS score
    FROM deal_lenders dl
    JOIN deals d ON d.id = dl.deal_id
    WHERE dl.master_lender_id IS NOT NULL
      AND d.company_id = ANY(_company_ids)
      AND (
        dl.name ILIKE '%' || _search_query || '%'
        OR d.company ILIKE '%' || _search_query || '%'
      )
    GROUP BY dl.master_lender_id
  ),
  notes_search AS (
    SELECT
      ln.master_lender_id AS lid,
      COALESCE(SUM(
        CASE
          WHEN ln.content ILIKE '%' || _search_query || '%' THEN 2.0
          ELSE 0.0
        END
      ), 0.0) AS score
    FROM lender_notes ln
    WHERE ln.master_lender_id IS NOT NULL
      AND ln.company_id = ANY(_company_ids)
    GROUP BY ln.master_lender_id
  ),
  contacts_search AS (
    SELECT
      lc.lender_id AS lid,
      COALESCE(SUM(
        CASE
          WHEN lc.name ILIKE '%' || t.term || '%' THEN 5.0
          WHEN lc.title ILIKE '%' || t.term || '%' THEN 3.0
          WHEN lc.email ILIKE '%' || t.term || '%' THEN 4.0
          WHEN lc.geography ILIKE '%' || t.term || '%' THEN 2.0
          WHEN lc.notes ILIKE '%' || t.term || '%' THEN 1.0
          ELSE 0.0
        END
      ), 0.0) * 4.0 AS score
    FROM lender_contacts lc
    JOIN master_lenders ml2 ON ml2.id = lc.lender_id,
    unnest(search_terms) t(term)
    WHERE ml2.company_id = ANY(_company_ids)
      AND (
        lc.name ILIKE '%' || t.term || '%'
        OR lc.title ILIKE '%' || t.term || '%'
        OR lc.email ILIKE '%' || t.term || '%'
        OR lc.geography ILIKE '%' || t.term || '%'
        OR lc.notes ILIKE '%' || t.term || '%'
      )
    GROUP BY lc.lender_id
  ),
  combined AS (
    SELECT
      COALESCE(p.lid, il.lid, dh.lid, ns.lid, cs.lid) AS lid,
      COALESCE(p.score, 0) + COALESCE(il.score, 0) + COALESCE(dh.score, 0) + COALESCE(ns.score, 0) + COALESCE(cs.score, 0) AS total_score
    FROM lender_profile_search p
    FULL OUTER JOIN lender_ilike_search il ON p.lid = il.lid
    FULL OUTER JOIN deal_history_search dh ON COALESCE(p.lid, il.lid) = dh.lid
    FULL OUTER JOIN notes_search ns ON COALESCE(p.lid, il.lid, dh.lid) = ns.lid
    FULL OUTER JOIN contacts_search cs ON COALESCE(p.lid, il.lid, dh.lid, ns.lid) = cs.lid
  ),
  filtered AS (
    SELECT lid, total_score
    FROM combined
    WHERE total_score > 0
  )
  SELECT
    f.lid AS lender_id,
    f.total_score AS relevance_score,
    (SELECT count(*) FROM filtered)::bigint AS total_count
  FROM filtered f
  ORDER BY f.total_score DESC, f.lid
  LIMIT _limit
  OFFSET _offset;
END;
$function$;
