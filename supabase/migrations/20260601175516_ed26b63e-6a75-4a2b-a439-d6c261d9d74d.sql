-- Recompute Time-to-Final-Credit-Items population: include any deal whose
-- Proposal Issued OR Final Credit Items stage_enter occurred inside the window.
-- Also add an "open / still pre-FCI" companion RPC for deals with PI in
-- window but no FCI yet (running clock = NOW() - pi_at).

CREATE OR REPLACE FUNCTION public.get_stage_transit_monthly(
  p_from_variants text[],
  p_to_variants   text[],
  p_window_months int DEFAULT 12,
  p_anchor        timestamptz DEFAULT NULL
)
RETURNS TABLE(
  bucket_month  timestamptz,
  avg_months    numeric,
  median_months numeric,
  deal_count    bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH anchor AS (
    SELECT COALESCE(p_anchor, NOW()) AS now_ts
  ),
  norm_from AS (SELECT lower(btrim(v)) AS v FROM unnest(p_from_variants) v),
  norm_to   AS (SELECT lower(btrim(v)) AS v FROM unnest(p_to_variants) v),
  proposal_issued AS (
    SELECT deal_id, MIN(changed_at) AS pi_at
    FROM deal_stage_history
    WHERE event_type = 'stage_enter'
      AND lower(btrim(to_stage)) IN (SELECT v FROM norm_from)
    GROUP BY deal_id
  ),
  final_credit AS (
    SELECT dsh.deal_id, MIN(dsh.changed_at) AS fci_at
    FROM deal_stage_history dsh
    JOIN proposal_issued pi ON pi.deal_id = dsh.deal_id
    WHERE dsh.event_type = 'stage_enter'
      AND lower(btrim(dsh.to_stage)) IN (SELECT v FROM norm_to)
      AND dsh.changed_at >= pi.pi_at
    GROUP BY dsh.deal_id
  ),
  paired AS (
    SELECT
      fc.deal_id,
      fc.fci_at,
      pi.pi_at,
      EXTRACT(EPOCH FROM (fc.fci_at - pi.pi_at)) / 86400.0 / 30.4375 AS months
    FROM final_credit fc
    JOIN proposal_issued pi USING (deal_id)
    CROSS JOIN anchor
    WHERE fc.fci_at >= pi.pi_at
      AND fc.fci_at <= anchor.now_ts
      AND (
        pi.pi_at  >= anchor.now_ts - make_interval(months => p_window_months)
        OR fc.fci_at >= anchor.now_ts - make_interval(months => p_window_months)
      )
  )
  SELECT
    DATE_TRUNC('month', fci_at) AS bucket_month,
    AVG(months)::numeric AS avg_months,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY months)::numeric AS median_months,
    COUNT(*)::bigint AS deal_count
  FROM paired
  GROUP BY 1
  ORDER BY 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_stage_transit_monthly(text[], text[], int, timestamptz)
  TO authenticated, service_role;

-- Open / still pre-FCI: deals with a Proposal Issued entry within the
-- trailing window but no Final Credit Items entry on or after it.
CREATE OR REPLACE FUNCTION public.get_stage_transit_open(
  p_from_variants text[],
  p_to_variants   text[],
  p_window_months int DEFAULT 12,
  p_anchor        timestamptz DEFAULT NULL
)
RETURNS TABLE(
  open_count       bigint,
  avg_open_months  numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH anchor AS (SELECT COALESCE(p_anchor, NOW()) AS now_ts),
  norm_from AS (SELECT lower(btrim(v)) AS v FROM unnest(p_from_variants) v),
  norm_to   AS (SELECT lower(btrim(v)) AS v FROM unnest(p_to_variants) v),
  proposal_issued AS (
    SELECT deal_id, MIN(changed_at) AS pi_at
    FROM deal_stage_history
    WHERE event_type = 'stage_enter'
      AND lower(btrim(to_stage)) IN (SELECT v FROM norm_from)
    GROUP BY deal_id
  ),
  final_credit AS (
    SELECT dsh.deal_id, MIN(dsh.changed_at) AS fci_at
    FROM deal_stage_history dsh
    JOIN proposal_issued pi ON pi.deal_id = dsh.deal_id
    WHERE dsh.event_type = 'stage_enter'
      AND lower(btrim(dsh.to_stage)) IN (SELECT v FROM norm_to)
      AND dsh.changed_at >= pi.pi_at
    GROUP BY dsh.deal_id
  ),
  open_deals AS (
    SELECT pi.deal_id, pi.pi_at,
           EXTRACT(EPOCH FROM (anchor.now_ts - pi.pi_at)) / 86400.0 / 30.4375 AS running_months
    FROM proposal_issued pi
    CROSS JOIN anchor
    LEFT JOIN final_credit fc ON fc.deal_id = pi.deal_id
    WHERE fc.deal_id IS NULL
      AND pi.pi_at >= anchor.now_ts - make_interval(months => p_window_months)
      AND pi.pi_at <= anchor.now_ts
  )
  SELECT COUNT(*)::bigint, COALESCE(AVG(running_months), 0)::numeric FROM open_deals;
$$;

GRANT EXECUTE ON FUNCTION public.get_stage_transit_open(text[], text[], int, timestamptz)
  TO authenticated, service_role;