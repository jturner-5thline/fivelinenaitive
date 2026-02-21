
-- Full-text keyword search function for lender directory
-- Searches across: master_lenders profile, deal_lenders history, lender_notes, lender_disqualifications
-- Returns lender IDs with relevance scores, ordered by score descending

CREATE OR REPLACE FUNCTION public.search_lenders_keyword(
  _search_query text,
  _limit integer DEFAULT 200,
  _offset integer DEFAULT 0
)
RETURNS TABLE(
  lender_id uuid,
  relevance_score float8,
  total_count bigint
) 
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
BEGIN
  -- Parse search query into individual terms (AND semantics)
  cleaned := regexp_replace(lower(trim(_search_query)), '[^a-z0-9\s]', ' ', 'g');
  cleaned := regexp_replace(cleaned, '\s+', ' ', 'g');
  search_terms := string_to_array(trim(cleaned), ' ');
  
  -- Remove empty strings
  search_terms := array_remove(search_terms, '');
  
  IF array_length(search_terms, 1) IS NULL OR array_length(search_terms, 1) = 0 THEN
    RETURN;
  END IF;
  
  -- Build tsquery with AND semantics
  ts_query := to_tsquery('simple', array_to_string(search_terms, ' & '));

  RETURN QUERY
  WITH lender_profile_search AS (
    -- Search across master_lenders profile fields
    SELECT 
      ml.id AS lid,
      -- Name exact/prefix match gets highest score
      CASE WHEN lower(ml.name) = lower(_search_query) THEN 100.0
           WHEN lower(ml.name) LIKE lower(_search_query) || '%' THEN 50.0
           ELSE 0.0 END
      +
      -- Full-text match on profile fields
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
        ) * 10.0, -- Strong weight for profile matches
        0.0
      ) AS score
    FROM master_lenders ml
  ),
  lender_ilike_search AS (
    -- Fallback: ilike matching for partial terms that FTS might miss
    SELECT 
      ml.id AS lid,
      (
        SELECT count(*)::float8 * 5.0
        FROM unnest(search_terms) t(term)
        WHERE 
          ml.name ILIKE '%' || t.term || '%'
          OR ml.contact_name ILIKE '%' || t.term || '%'
          OR ml.email ILIKE '%' || t.term || '%'
          OR ml.lender_type ILIKE '%' || t.term || '%'
          OR ml.geo ILIKE '%' || t.term || '%'
          OR ml.tier ILIKE '%' || t.term || '%'
          OR ml.company_requirements ILIKE '%' || t.term || '%'
          OR ml.deal_structure_notes ILIKE '%' || t.term || '%'
          OR ml.sponsorship ILIKE '%' || t.term || '%'
          OR ml.relationship_owners ILIKE '%' || t.term || '%'
          OR EXISTS (SELECT 1 FROM unnest(ml.loan_types) lt WHERE lt ILIKE '%' || t.term || '%')
          OR EXISTS (SELECT 1 FROM unnest(ml.industries) ind WHERE ind ILIKE '%' || t.term || '%')
          OR EXISTS (SELECT 1 FROM unnest(ml.industries_to_avoid) ita WHERE ita ILIKE '%' || t.term || '%')
      ) AS score
    FROM master_lenders ml
  ),
  deal_history_search AS (
    -- Search across deal_lenders joined with deals
    SELECT 
      ml.id AS lid,
      COALESCE(SUM(
        (
          SELECT count(*)::float8
          FROM unnest(search_terms) t(term)
          WHERE 
            dl.name ILIKE '%' || t.term || '%'
            OR dl.stage ILIKE '%' || t.term || '%'
            OR dl.notes ILIKE '%' || t.term || '%'
            OR dl.pass_reason ILIKE '%' || t.term || '%'
            OR dl.tracking_status ILIKE '%' || t.term || '%'
            OR d.company ILIKE '%' || t.term || '%'
            OR d.stage ILIKE '%' || t.term || '%'
            OR d.industry ILIKE '%' || t.term || '%'
            OR d.deal_type ILIKE '%' || t.term || '%'
        )
      ), 0.0) * 3.0 AS score  -- Medium weight for deal history
    FROM master_lenders ml
    JOIN deal_lenders dl ON lower(trim(dl.name)) = lower(trim(ml.name))
    JOIN deals d ON d.id = dl.deal_id
    GROUP BY ml.id
  ),
  notes_search AS (
    -- Search across internal lender notes
    SELECT 
      ml.id AS lid,
      COALESCE(SUM(
        (
          SELECT count(*)::float8
          FROM unnest(search_terms) t(term)
          WHERE 
            ln.body ILIKE '%' || t.term || '%'
            OR EXISTS (SELECT 1 FROM unnest(ln.tags) tag WHERE tag ILIKE '%' || t.term || '%')
        )
      ), 0.0) * 2.0 AS score  -- Lower weight for notes
    FROM master_lenders ml
    JOIN lender_notes ln ON lower(trim(ln.lender_name)) = lower(trim(ml.name))
    GROUP BY ml.id
  ),
  disqualification_search AS (
    -- Search across lender disqualification history
    SELECT 
      ml.id AS lid,
      COALESCE(SUM(
        (
          SELECT count(*)::float8
          FROM unnest(search_terms) t(term)
          WHERE 
            ld.reason_category ILIKE '%' || t.term || '%'
            OR ld.reason_details ILIKE '%' || t.term || '%'
            OR ld.deal_industry ILIKE '%' || t.term || '%'
            OR ld.deal_geography ILIKE '%' || t.term || '%'
        )
      ), 0.0) * 3.0 AS score  -- Medium weight for pass reasons
    FROM master_lenders ml
    JOIN lender_disqualifications ld ON ld.master_lender_id = ml.id
    GROUP BY ml.id
  ),
  combined AS (
    SELECT 
      COALESCE(p.lid, i.lid, dh.lid, n.lid, dq.lid) AS lid,
      COALESCE(p.score, 0) + COALESCE(i.score, 0) + COALESCE(dh.score, 0) + COALESCE(n.score, 0) + COALESCE(dq.score, 0) AS total_score
    FROM lender_profile_search p
    FULL OUTER JOIN lender_ilike_search i ON i.lid = p.lid
    FULL OUTER JOIN deal_history_search dh ON dh.lid = COALESCE(p.lid, i.lid)
    FULL OUTER JOIN notes_search n ON n.lid = COALESCE(p.lid, i.lid, dh.lid)
    FULL OUTER JOIN disqualification_search dq ON dq.lid = COALESCE(p.lid, i.lid, dh.lid, n.lid)
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
