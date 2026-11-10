CREATE OR REPLACE FUNCTION public.get_stage_transit_monthly(
  p_from_variants text[], p_to_variants text[], p_window_months int DEFAULT 12,
  p_anchor timestamptz DEFAULT NULL, p_exclude_deal_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(bucket_month timestamptz, avg_months numeric, median_months numeric, deal_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH anchor AS (SELECT COALESCE(p_anchor, NOW()) AS now_ts),
  norm_from AS (SELECT lower(btrim(v)) AS v FROM unnest(p_from_variants) v),
  norm_to   AS (SELECT lower(btrim(v)) AS v FROM unnest(p_to_variants) v),
  from_events AS (
    SELECT deal_id, changed_at FROM deal_stage_history
    WHERE event_type = 'stage_enter' AND lower(btrim(to_stage)) IN (SELECT v FROM norm_from)
      AND NOT (deal_id = ANY(COALESCE(p_exclude_deal_ids, '{}'::uuid[])))
  ),
  first_from AS (SELECT deal_id, MIN(changed_at) AS first_at FROM from_events GROUP BY deal_id),
  final_credit AS (
    SELECT dsh.deal_id, MIN(dsh.changed_at) AS fci_at
    FROM deal_stage_history dsh JOIN first_from ff ON ff.deal_id = dsh.deal_id
    WHERE dsh.event_type = 'stage_enter' AND lower(btrim(dsh.to_stage)) IN (SELECT v FROM norm_to)
      AND dsh.changed_at >= ff.first_at
    GROUP BY dsh.deal_id
  ),
  proposal_issued AS (
    SELECT fc.deal_id, MAX(fe.changed_at) AS pi_at
    FROM final_credit fc JOIN from_events fe ON fe.deal_id = fc.deal_id AND fe.changed_at <= fc.fci_at
    GROUP BY fc.deal_id
  ),
  paired AS (
    SELECT fc.deal_id, fc.fci_at, pi.pi_at,
      EXTRACT(EPOCH FROM (fc.fci_at - pi.pi_at)) / 86400.0 / 30.4375 AS months
    FROM final_credit fc JOIN proposal_issued pi USING (deal_id) CROSS JOIN anchor
    WHERE fc.fci_at >= pi.pi_at AND fc.fci_at <= anchor.now_ts
      AND (pi.pi_at >= anchor.now_ts - make_interval(months => p_window_months)
        OR fc.fci_at >= anchor.now_ts - make_interval(months => p_window_months))
  )
  SELECT DATE_TRUNC('month', fci_at), AVG(months)::numeric,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY months)::numeric, COUNT(*)::bigint
  FROM paired GROUP BY 1 ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION public.get_stage_transit_open(
  p_from_variants text[], p_to_variants text[], p_window_months int DEFAULT 12,
  p_anchor timestamptz DEFAULT NULL, p_exclude_deal_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(open_count bigint, avg_open_months numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH anchor AS (SELECT COALESCE(p_anchor, NOW()) AS now_ts),
  norm_from AS (SELECT lower(btrim(v)) AS v FROM unnest(p_from_variants) v),
  norm_to   AS (SELECT lower(btrim(v)) AS v FROM unnest(p_to_variants) v),
  from_events AS (
    SELECT deal_id, changed_at FROM deal_stage_history
    WHERE event_type = 'stage_enter' AND lower(btrim(to_stage)) IN (SELECT v FROM norm_from)
      AND NOT (deal_id = ANY(COALESCE(p_exclude_deal_ids, '{}'::uuid[])))
  ),
  first_from AS (SELECT deal_id, MIN(changed_at) AS first_at FROM from_events GROUP BY deal_id),
  final_credit AS (
    SELECT dsh.deal_id FROM deal_stage_history dsh JOIN first_from ff ON ff.deal_id = dsh.deal_id
    WHERE dsh.event_type = 'stage_enter' AND lower(btrim(dsh.to_stage)) IN (SELECT v FROM norm_to)
      AND dsh.changed_at >= ff.first_at
    GROUP BY dsh.deal_id
  ),
  latest_from AS (SELECT deal_id, MAX(changed_at) AS pi_at FROM from_events GROUP BY deal_id),
  open_deals AS (
    SELECT lf.deal_id, EXTRACT(EPOCH FROM (anchor.now_ts - lf.pi_at)) / 86400.0 / 30.4375 AS running_months
    FROM latest_from lf CROSS JOIN anchor
    LEFT JOIN final_credit fc ON fc.deal_id = lf.deal_id
    WHERE fc.deal_id IS NULL
      AND lf.pi_at >= anchor.now_ts - make_interval(months => p_window_months)
      AND lf.pi_at <= anchor.now_ts
  )
  SELECT COUNT(*)::bigint, COALESCE(AVG(running_months), 0)::numeric FROM open_deals;
$$;

CREATE OR REPLACE FUNCTION public.get_stage_transit_deals(p_from_variants text[], p_to_variants text[], p_window_months integer DEFAULT 12, p_anchor timestamptz DEFAULT NULL, p_exclude_deal_ids uuid[] DEFAULT NULL)
RETURNS TABLE(deal_id uuid, deal_name text, from_at timestamptz, to_at timestamptz, months numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $$
  WITH anchor AS (SELECT COALESCE(p_anchor, NOW()) AS now_ts),
  norm_from AS (SELECT lower(btrim(v)) AS v FROM unnest(p_from_variants) v),
  norm_to   AS (SELECT lower(btrim(v)) AS v FROM unnest(p_to_variants) v),
  fe AS (
    SELECT h.deal_id, h.changed_at FROM deal_stage_history h
    WHERE h.event_type = 'stage_enter' AND lower(btrim(h.to_stage)) IN (SELECT v FROM norm_from)
      AND NOT (h.deal_id = ANY(COALESCE(p_exclude_deal_ids, '{}'::uuid[])))
  ),
  ff AS (SELECT fe.deal_id, MIN(fe.changed_at) AS first_at FROM fe GROUP BY fe.deal_id),
  t AS (
    SELECT h.deal_id, MIN(h.changed_at) AS to_at FROM deal_stage_history h JOIN ff ON ff.deal_id = h.deal_id
    WHERE h.event_type = 'stage_enter' AND lower(btrim(h.to_stage)) IN (SELECT v FROM norm_to) AND h.changed_at >= ff.first_at
    GROUP BY h.deal_id
  ),
  f AS (
    SELECT t.deal_id, MAX(fe.changed_at) AS from_at FROM t JOIN fe ON fe.deal_id = t.deal_id AND fe.changed_at <= t.to_at
    GROUP BY t.deal_id
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