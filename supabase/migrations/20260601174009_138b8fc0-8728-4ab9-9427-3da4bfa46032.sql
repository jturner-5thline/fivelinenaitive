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
  norm_from AS (
    SELECT lower(btrim(v)) AS v FROM unnest(p_from_variants) v
  ),
  norm_to AS (
    SELECT lower(btrim(v)) AS v FROM unnest(p_to_variants) v
  ),
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
    WHERE fc.fci_at >= anchor.now_ts - make_interval(months => p_window_months)
      AND fc.fci_at <= anchor.now_ts
      AND fc.fci_at >= pi.pi_at
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

CREATE OR REPLACE FUNCTION public.log_inverted_pi_fci_pairs(
  p_from_variants text[],
  p_to_variants   text[]
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH norm_from AS (SELECT lower(btrim(v)) AS v FROM unnest(p_from_variants) v),
  norm_to AS (SELECT lower(btrim(v)) AS v FROM unnest(p_to_variants) v),
  pi AS (
    SELECT deal_id, MIN(changed_at) AS pi_at
    FROM deal_stage_history
    WHERE event_type='stage_enter' AND lower(btrim(to_stage)) IN (SELECT v FROM norm_from)
    GROUP BY deal_id
  ),
  fc AS (
    SELECT deal_id, MIN(changed_at) AS fci_at
    FROM deal_stage_history
    WHERE event_type='stage_enter' AND lower(btrim(to_stage)) IN (SELECT v FROM norm_to)
    GROUP BY deal_id
  ),
  inverted AS (
    SELECT fc.deal_id, pi.pi_at, fc.fci_at
    FROM fc JOIN pi USING (deal_id)
    WHERE fc.fci_at < pi.pi_at
  ),
  ins AS (
    INSERT INTO public.data_quality_issues (source_table, source_row_id, deal_id, issue_type, details)
    SELECT 'deal_stage_history', deal_id, deal_id, 'inverted_transit_pi_fci',
           jsonb_build_object('pi_at', pi_at, 'fci_at', fci_at)
    FROM inverted
    ON CONFLICT (source_table, source_row_id, issue_type) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_count FROM ins;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_inverted_pi_fci_pairs(text[], text[])
  TO authenticated, service_role;