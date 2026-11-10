CREATE OR REPLACE FUNCTION public.get_stage_transit_deals(p_from_variants text[], p_to_variants text[], p_window_months integer DEFAULT 12, p_anchor timestamptz DEFAULT NULL, p_exclude_deal_ids uuid[] DEFAULT NULL)
RETURNS TABLE(deal_id uuid, deal_name text, from_at timestamptz, to_at timestamptz, months numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $$
  WITH anchor AS (SELECT COALESCE(p_anchor, NOW()) AS now_ts),
  norm_from AS (SELECT lower(btrim(v)) AS v FROM unnest(p_from_variants) v),
  norm_to   AS (SELECT lower(btrim(v)) AS v FROM unnest(p_to_variants) v),
  f AS (
    SELECT h.deal_id, MIN(h.changed_at) AS from_at FROM deal_stage_history h
    WHERE h.event_type = 'stage_enter' AND lower(btrim(h.to_stage)) IN (SELECT v FROM norm_from)
      AND NOT (h.deal_id = ANY(COALESCE(p_exclude_deal_ids, '{}'::uuid[])))
    GROUP BY h.deal_id
  ),
  t AS (
    SELECT h.deal_id, MIN(h.changed_at) AS to_at FROM deal_stage_history h JOIN f ON f.deal_id = h.deal_id
    WHERE h.event_type = 'stage_enter' AND lower(btrim(h.to_stage)) IN (SELECT v FROM norm_to) AND h.changed_at >= f.from_at
    GROUP BY h.deal_id
  )
  SELECT f.deal_id, d.company::text, f.from_at, t.to_at,
    (EXTRACT(EPOCH FROM (t.to_at - f.from_at)) / 86400.0 / 30.4375)::numeric
  FROM t JOIN f USING (deal_id) CROSS JOIN anchor
  LEFT JOIN deals d ON d.id = f.deal_id
  WHERE t.to_at >= f.from_at AND t.to_at <= anchor.now_ts
    AND (f.from_at >= anchor.now_ts - make_interval(months => p_window_months)
      OR t.to_at >= anchor.now_ts - make_interval(months => p_window_months))
  ORDER BY t.to_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_stage_transit_deals(text[], text[], integer, timestamptz, uuid[]) TO authenticated;