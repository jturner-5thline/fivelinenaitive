-- Phase 3: outcome feedback loop for lender matching

-- 1. Make outcomes upsertable per (deal, lender)
CREATE UNIQUE INDEX IF NOT EXISTS lender_recommendation_outcomes_deal_lender_uniq
  ON public.lender_recommendation_outcomes (deal_id, lender_id)
  WHERE lender_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lender_rec_outcomes_status
  ON public.lender_recommendation_outcomes (status, reported_at DESC);

-- 2. Auto-capture outcomes from deal_lenders pipeline movement
CREATE OR REPLACE FUNCTION public.capture_lender_recommendation_outcome()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.lender_recommendation_outcome_status;
  v_stage text := lower(coalesce(NEW.stage, ''));
  v_track text := lower(coalesce(NEW.tracking_status, ''));
  v_run_id uuid;
BEGIN
  IF NEW.master_lender_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_track = 'excluded' THEN
    v_status := 'dismissed';
  ELSIF v_track = 'passed' OR NEW.passed_at IS NOT NULL OR NEW.declined_at IS NOT NULL
        OR v_stage LIKE '%pass%' OR v_stage LIKE '%declin%' THEN
    v_status := 'declined';
  ELSIF v_stage LIKE '%funded%' OR v_stage LIKE '%closed won%' OR v_stage LIKE '%won%' THEN
    v_status := 'closed_won';
  ELSIF v_stage LIKE '%term%' OR NEW.quote_amount IS NOT NULL THEN
    v_status := 'terms_issued';
  ELSIF v_stage LIKE '%diligence%' THEN
    v_status := 'diligence';
  ELSIF NEW.submitted_at IS NOT NULL OR v_stage LIKE '%review%' OR v_stage LIKE '%submitted%' THEN
    v_status := 'engaged';
  ELSIF NEW.last_contact_at IS NOT NULL OR v_stage LIKE '%outreach%' OR v_stage LIKE '%contact%' THEN
    v_status := 'contacted';
  ELSE
    v_status := 'recommended';
  END IF;

  SELECT r.id INTO v_run_id
  FROM public.lender_recommendation_runs r
  JOIN public.lender_recommendation_run_items i ON i.run_id = r.id
  WHERE r.deal_id = NEW.deal_id AND i.lender_id = NEW.master_lender_id
  ORDER BY r.generated_at DESC
  LIMIT 1;

  INSERT INTO public.lender_recommendation_outcomes
    (deal_id, lender_id, lender_name, run_id, status, reported_at)
  VALUES (NEW.deal_id, NEW.master_lender_id, NEW.name, v_run_id, v_status, now())
  ON CONFLICT (deal_id, lender_id) WHERE lender_id IS NOT NULL
  DO UPDATE SET
    status = EXCLUDED.status,
    lender_name = EXCLUDED.lender_name,
    run_id = COALESCE(public.lender_recommendation_outcomes.run_id, EXCLUDED.run_id),
    reported_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_lender_recommendation_outcome ON public.deal_lenders;
CREATE TRIGGER trg_capture_lender_recommendation_outcome
AFTER INSERT OR UPDATE OF stage, tracking_status, submitted_at, passed_at, declined_at, quote_amount, last_contact_at
ON public.deal_lenders
FOR EACH ROW EXECUTE FUNCTION public.capture_lender_recommendation_outcome();

-- 3. Calibration snapshots
CREATE TABLE IF NOT EXISTS public.lender_match_weight_calibrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  weights jsonb NOT NULL,
  base_weights jsonb NOT NULL,
  component_stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  success_samples integer NOT NULL DEFAULT 0,
  failure_samples integer NOT NULL DEFAULT 0,
  lookback_days integer NOT NULL DEFAULT 365,
  is_active boolean NOT NULL DEFAULT false,
  computed_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  created_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lender_match_weight_calibrations TO authenticated;
GRANT ALL ON public.lender_match_weight_calibrations TO service_role;

ALTER TABLE public.lender_match_weight_calibrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view calibrations"
  ON public.lender_match_weight_calibrations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert calibrations"
  ON public.lender_match_weight_calibrations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update calibrations"
  ON public.lender_match_weight_calibrations FOR UPDATE TO authenticated USING (true);

CREATE UNIQUE INDEX IF NOT EXISTS lender_match_weight_calibrations_one_active
  ON public.lender_match_weight_calibrations ((company_id IS NULL), coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE is_active;

-- 4. Calibration computation from logged recommendations + outcomes
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
           c->>'key' AS key,
           NULLIF((c->>'weight')::numeric, 0) AS weight,
           (c->>'earned')::numeric AS earned,
           coalesce((c->>'available')::boolean, true) AS available
    FROM scored s
    CROSS JOIN LATERAL jsonb_array_elements(s.components) AS c
    WHERE s.label IS NOT NULL
  ), per_key AS (
    SELECT key,
           avg(earned / weight) FILTER (WHERE label = 1) AS success_ratio,
           avg(earned / weight) FILTER (WHERE label = 0) AS failure_ratio,
           count(*) FILTER (WHERE label = 1) AS n_success,
           count(*) FILTER (WHERE label = 0) AS n_failure
    FROM exploded
    WHERE available AND weight IS NOT NULL
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

  -- Adjust each base weight by observed lift, shrunk by sample size.
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

CREATE OR REPLACE FUNCTION public.activate_lender_match_calibration(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.lender_match_weight_calibrations
     SET is_active = false, activated_at = activated_at
   WHERE is_active = true
     AND company_id IS NOT DISTINCT FROM (
       SELECT company_id FROM public.lender_match_weight_calibrations WHERE id = p_id);

  UPDATE public.lender_match_weight_calibrations
     SET is_active = true, activated_at = now()
   WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_lender_match_calibration(jsonb, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_lender_match_calibration(uuid) TO authenticated;