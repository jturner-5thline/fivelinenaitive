-- Phase 3 follow-up: aggregate the object-shaped component snapshots logged by the recommender.
CREATE OR REPLACE FUNCTION public.compute_lender_match_calibration(
  p_base_weights jsonb,
  p_lookback_days integer DEFAULT 365,
  p_persist boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stats jsonb;
  v_weights jsonb := '{}'::jsonb;
  v_success int := 0;
  v_failure int := 0;
  v_total numeric := 0;
  v_key text;
  v_raw jsonb := '{}'::jsonb;
  v_id uuid;
BEGIN
  WITH scored AS (
    SELECT i.components,
           o.status,
           CASE WHEN o.status IN ('engaged','terms_issued','diligence','closed_won') THEN 1
                WHEN o.status IN ('declined','dismissed','closed_lost') THEN 0
                ELSE NULL END AS label
    FROM public.lender_recommendation_run_items i
    JOIN public.lender_recommendation_runs r ON r.id = i.run_id
    JOIN public.lender_recommendation_outcomes o
      ON o.deal_id = r.deal_id AND o.lender_id = i.lender_id
    WHERE i.components IS NOT NULL
      AND i.hard_filtered = false
      AND r.generated_at >= now() - make_interval(days => p_lookback_days)
  ), exploded AS (
    SELECT s.label,
           kv.key,
           (kv.value)::numeric AS score
    FROM scored s
    CROSS JOIN LATERAL jsonb_each(s.components) AS kv
    WHERE s.label IS NOT NULL
      AND kv.key <> 'ai'
      AND p_base_weights ? kv.key
  ), per_key AS (
    SELECT key,
           avg(score / 100.0) FILTER (WHERE label = 1) AS success_ratio,
           avg(score / 100.0) FILTER (WHERE label = 0) AS failure_ratio,
           count(*) FILTER (WHERE label = 1) AS n_success,
           count(*) FILTER (WHERE label = 0) AS n_failure
    FROM exploded
    GROUP BY key
  )
  SELECT jsonb_object_agg(key, jsonb_build_object(
           'success_ratio', round(coalesce(success_ratio, 0)::numeric, 4),
           'failure_ratio', round(coalesce(failure_ratio, 0)::numeric, 4),
           'lift', round((coalesce(success_ratio, 0) - coalesce(failure_ratio, 0))::numeric, 4),
           'n_success', n_success,
           'n_failure', n_failure
         )),
         coalesce(max(n_success), 0),
         coalesce(max(n_failure), 0)
  INTO v_stats, v_success, v_failure
  FROM per_key;

  v_stats := coalesce(v_stats, '{}'::jsonb);

  FOR v_key IN SELECT jsonb_object_keys(p_base_weights) LOOP
    DECLARE
      v_base numeric := (p_base_weights->>v_key)::numeric;
      v_lift numeric := coalesce((v_stats->v_key->>'lift')::numeric, 0);
      v_n numeric := coalesce((v_stats->v_key->>'n_success')::numeric, 0)
                   + coalesce((v_stats->v_key->>'n_failure')::numeric, 0);
      v_shrink numeric := v_n / (v_n + 40);
      v_adj numeric;
    BEGIN
      v_adj := greatest(v_base * 0.4, least(v_base * 2.0, v_base * (1 + v_lift * v_shrink)));
      v_raw := v_raw || jsonb_build_object(v_key, v_adj);
      v_total := v_total + v_adj;
    END;
  END LOOP;

  IF v_total <= 0 THEN
    v_weights := p_base_weights;
  ELSE
    FOR v_key IN SELECT jsonb_object_keys(v_raw) LOOP
      v_weights := v_weights || jsonb_build_object(
        v_key, round(((v_raw->>v_key)::numeric / v_total) * 100, 2));
    END LOOP;
  END IF;

  IF p_persist THEN
    INSERT INTO public.lender_match_weight_calibrations
      (weights, base_weights, component_stats, success_samples, failure_samples, lookback_days, created_by)
    VALUES (v_weights, p_base_weights, v_stats, v_success, v_failure, p_lookback_days, auth.uid())
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_id,
    'weights', v_weights,
    'base_weights', p_base_weights,
    'component_stats', v_stats,
    'success_samples', v_success,
    'failure_samples', v_failure
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_lender_match_calibration(jsonb, integer, boolean) TO authenticated;