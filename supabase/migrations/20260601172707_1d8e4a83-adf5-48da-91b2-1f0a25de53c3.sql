-- ============================================================
-- Stage duration metrics — derived layer over deal_stage_history
-- ============================================================

-- 1) Data quality issues log ---------------------------------
CREATE TABLE IF NOT EXISTS public.data_quality_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table text NOT NULL,
  source_row_id uuid,
  deal_id uuid,
  issue_type text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (source_table, source_row_id, issue_type)
);
GRANT SELECT ON public.data_quality_issues TO authenticated;
GRANT ALL ON public.data_quality_issues TO service_role;
ALTER TABLE public.data_quality_issues ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read data quality issues" ON public.data_quality_issues;
CREATE POLICY "Authenticated read data quality issues"
  ON public.data_quality_issues FOR SELECT TO authenticated USING (true);

-- 2) Mat view refresh log ------------------------------------
CREATE TABLE IF NOT EXISTS public.mat_view_refresh_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  view_name text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  status text NOT NULL DEFAULT 'started',
  error text
);
GRANT SELECT ON public.mat_view_refresh_log TO authenticated;
GRANT ALL ON public.mat_view_refresh_log TO service_role;
ALTER TABLE public.mat_view_refresh_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read refresh log" ON public.mat_view_refresh_log;
CREATE POLICY "Authenticated read refresh log"
  ON public.mat_view_refresh_log FOR SELECT TO authenticated USING (true);

-- 3) deal_stage_durations matview ----------------------------
-- Stage slug = the text label (to_stage / from_stage) because to_stage_id
-- is empty for most historical rows AND because DiD-suffixed labels are
-- distinct stages we must NOT collapse (per the historical import resolver).
DROP MATERIALIZED VIEW IF EXISTS public.deal_stage_durations CASCADE;
CREATE MATERIALIZED VIEW public.deal_stage_durations AS
WITH enters AS (
  SELECT
    id AS enter_event_id,
    deal_id, company_id, pipeline_id,
    to_stage    AS stage_slug,
    to_stage_id AS stage_id,
    changed_at  AS entered_at,
    source      AS enter_source,
    changed_by  AS enter_actor,
    ROW_NUMBER() OVER (PARTITION BY deal_id, to_stage ORDER BY changed_at, id) AS enter_seq
  FROM public.deal_stage_history
  WHERE event_type = 'stage_enter' AND to_stage IS NOT NULL
),
exits AS (
  SELECT
    id AS exit_event_id,
    deal_id,
    from_stage AS stage_slug,
    COALESCE(exited_at, changed_at) AS exited_at,
    source     AS exit_source,
    changed_by AS exit_actor,
    ROW_NUMBER() OVER (
      PARTITION BY deal_id, from_stage
      ORDER BY COALESCE(exited_at, changed_at), id
    ) AS exit_seq
  FROM public.deal_stage_history
  WHERE event_type = 'stage_exit' AND from_stage IS NOT NULL
),
paired AS (
  SELECT
    e.enter_event_id, e.deal_id, e.company_id, e.pipeline_id,
    e.stage_slug, e.stage_id,
    e.entered_at,
    x.exited_at,
    e.enter_source, x.exit_source,
    e.enter_actor, x.exit_actor
  FROM enters e
  LEFT JOIN exits x
    ON x.deal_id    = e.deal_id
   AND x.stage_slug = e.stage_slug
   AND x.exit_seq   = e.enter_seq
)
SELECT
  enter_event_id,
  deal_id, company_id, pipeline_id,
  stage_slug, stage_id,
  entered_at, exited_at,
  CASE
    WHEN exited_at IS NULL                THEN NULL
    WHEN exited_at < entered_at           THEN NULL
    ELSE EXTRACT(EPOCH FROM (exited_at - entered_at))::bigint
  END AS duration_seconds,
  (exited_at IS NULL) AS is_open,
  CASE WHEN exited_at IS NOT NULL AND exited_at < entered_at
       THEN 'inverted_exit_before_enter' END AS quality_flag,
  CASE WHEN enter_source LIKE 'historical_import%' THEN 'day' ELSE 'minute' END AS enter_precision,
  CASE
    WHEN exit_source IS NULL                          THEN NULL
    WHEN exit_source  LIKE 'historical_import%_exit'  THEN 'minute'
    WHEN exit_source  LIKE 'historical_import%'       THEN 'day'
    ELSE 'minute'
  END AS exit_precision,
  enter_source, exit_source, enter_actor, exit_actor
FROM paired;

CREATE UNIQUE INDEX deal_stage_durations_pk     ON public.deal_stage_durations(enter_event_id);
CREATE INDEX        deal_stage_durations_deal   ON public.deal_stage_durations(deal_id);
CREATE INDEX        deal_stage_durations_stage  ON public.deal_stage_durations(stage_slug);
CREATE INDEX        deal_stage_durations_open   ON public.deal_stage_durations(is_open) WHERE is_open;

GRANT SELECT ON public.deal_stage_durations TO authenticated;
GRANT ALL    ON public.deal_stage_durations TO service_role;

-- 4) deal_stage_transitions matview --------------------------
DROP MATERIALIZED VIEW IF EXISTS public.deal_stage_transitions CASCADE;
CREATE MATERIALIZED VIEW public.deal_stage_transitions AS
WITH enters AS (
  SELECT
    id AS enter_event_id,
    deal_id, company_id,
    to_stage   AS stage_slug,
    changed_at AS entered_at,
    ROW_NUMBER() OVER (PARTITION BY deal_id ORDER BY changed_at, id) AS rn
  FROM public.deal_stage_history
  WHERE event_type = 'stage_enter' AND to_stage IS NOT NULL
)
SELECT
  a.deal_id, a.company_id,
  a.stage_slug AS from_stage_slug,
  b.stage_slug AS to_stage_slug,
  a.entered_at AS from_entered_at,
  b.entered_at AS to_entered_at,
  EXTRACT(EPOCH FROM (b.entered_at - a.entered_at))::bigint AS transit_seconds,
  (b.rn = a.rn + 1) AS is_consecutive,
  a.enter_event_id AS from_enter_event_id,
  b.enter_event_id AS to_enter_event_id
FROM enters a
JOIN enters b
  ON b.deal_id = a.deal_id
 AND b.rn > a.rn;

CREATE UNIQUE INDEX deal_stage_transitions_pk    ON public.deal_stage_transitions(from_enter_event_id, to_enter_event_id);
CREATE INDEX        deal_stage_transitions_deal  ON public.deal_stage_transitions(deal_id);
CREATE INDEX        deal_stage_transitions_pair  ON public.deal_stage_transitions(from_stage_slug, to_stage_slug);
CREATE INDEX        deal_stage_transitions_cons  ON public.deal_stage_transitions(is_consecutive) WHERE is_consecutive;

GRANT SELECT ON public.deal_stage_transitions TO authenticated;
GRANT ALL    ON public.deal_stage_transitions TO service_role;

-- 5) Refresh function ----------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_deal_stage_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id  uuid;
  v_started timestamptz := clock_timestamp();
BEGIN
  IF NOT pg_try_advisory_xact_lock(8743271234) THEN
    INSERT INTO public.mat_view_refresh_log(view_name, status, finished_at, duration_ms)
    VALUES ('deal_stage_metrics', 'skipped_locked', clock_timestamp(), 0);
    RETURN;
  END IF;

  INSERT INTO public.mat_view_refresh_log(view_name, status)
  VALUES ('deal_stage_metrics','started')
  RETURNING id INTO v_log_id;

  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.deal_stage_durations;
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.deal_stage_transitions;

    -- log any inverted pairs as data quality issues
    INSERT INTO public.data_quality_issues (source_table, source_row_id, deal_id, issue_type, details)
    SELECT 'deal_stage_history', d.enter_event_id, d.deal_id, 'inverted_exit_before_enter',
           jsonb_build_object('entered_at', d.entered_at, 'exited_at', d.exited_at, 'stage_slug', d.stage_slug)
    FROM public.deal_stage_durations d
    WHERE d.quality_flag = 'inverted_exit_before_enter'
    ON CONFLICT (source_table, source_row_id, issue_type) DO NOTHING;

    UPDATE public.mat_view_refresh_log
       SET status='success',
           finished_at = clock_timestamp(),
           duration_ms = (EXTRACT(EPOCH FROM (clock_timestamp()-v_started))*1000)::int
     WHERE id = v_log_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.mat_view_refresh_log
       SET status='error', error = SQLERRM,
           finished_at = clock_timestamp(),
           duration_ms = (EXTRACT(EPOCH FROM (clock_timestamp()-v_started))*1000)::int
     WHERE id = v_log_id;
    RAISE;
  END;
END;
$$;
GRANT EXECUTE ON FUNCTION public.refresh_deal_stage_metrics() TO authenticated, service_role;

-- 6) Statement-level trigger to keep views fresh on live events
CREATE OR REPLACE FUNCTION public.trg_refresh_deal_stage_metrics()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.refresh_deal_stage_metrics();
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_dsh_refresh_metrics ON public.deal_stage_history;
CREATE TRIGGER trg_dsh_refresh_metrics
AFTER INSERT OR UPDATE OR DELETE ON public.deal_stage_history
FOR EACH STATEMENT EXECUTE FUNCTION public.trg_refresh_deal_stage_metrics();

-- 7) Read API ------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_deal_stage_durations(p_deal_id uuid)
RETURNS TABLE (
  enter_event_id uuid,
  stage_slug text,
  entered_at timestamptz,
  exited_at timestamptz,
  duration_seconds bigint,
  is_open boolean,
  enter_precision text,
  exit_precision text,
  enter_source text,
  exit_source text,
  quality_flag text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT enter_event_id, stage_slug, entered_at, exited_at,
         COALESCE(duration_seconds,
           CASE WHEN is_open THEN EXTRACT(EPOCH FROM (now() - entered_at))::bigint END),
         is_open, enter_precision, exit_precision, enter_source, exit_source, quality_flag
  FROM public.deal_stage_durations
  WHERE deal_id = p_deal_id
  ORDER BY entered_at;
$$;
GRANT EXECUTE ON FUNCTION public.get_deal_stage_durations(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_avg_time_in_stage(
  p_stage_slug text,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to   timestamptz DEFAULT NULL,
  p_include_open boolean DEFAULT false
)
RETURNS TABLE (
  stage_slug text,
  n_instances bigint,
  avg_seconds numeric,
  median_seconds numeric,
  p90_seconds numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH base AS (
    SELECT
      stage_slug,
      CASE
        WHEN duration_seconds IS NOT NULL THEN duration_seconds
        WHEN p_include_open AND is_open
          THEN EXTRACT(EPOCH FROM (now() - entered_at))::bigint
        ELSE NULL
      END AS dur
    FROM public.deal_stage_durations
    WHERE stage_slug = p_stage_slug
      AND (p_date_from IS NULL OR entered_at >= p_date_from)
      AND (p_date_to   IS NULL OR entered_at <  p_date_to)
  )
  SELECT
    p_stage_slug,
    COUNT(dur),
    AVG(dur),
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dur),
    PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY dur)
  FROM base
  WHERE dur IS NOT NULL;
$$;
GRANT EXECUTE ON FUNCTION public.get_avg_time_in_stage(text,timestamptz,timestamptz,boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_avg_time_between_stages(
  p_from_stage text,
  p_to_stage   text,
  p_consecutive_only boolean DEFAULT false,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to   timestamptz DEFAULT NULL
)
RETURNS TABLE (
  from_stage_slug text,
  to_stage_slug text,
  n_transitions bigint,
  avg_seconds numeric,
  median_seconds numeric,
  p90_seconds numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p_from_stage, p_to_stage,
    COUNT(*)::bigint,
    AVG(transit_seconds),
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY transit_seconds),
    PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY transit_seconds)
  FROM public.deal_stage_transitions
  WHERE from_stage_slug = p_from_stage
    AND to_stage_slug   = p_to_stage
    AND (NOT p_consecutive_only OR is_consecutive)
    AND (p_date_from IS NULL OR from_entered_at >= p_date_from)
    AND (p_date_to   IS NULL OR from_entered_at <  p_date_to);
$$;
GRANT EXECUTE ON FUNCTION public.get_avg_time_between_stages(text,text,boolean,timestamptz,timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_funnel_velocity(
  p_stage_path text[],
  p_consecutive_only boolean DEFAULT false
)
RETURNS TABLE (
  segment_index int,
  from_stage_slug text,
  to_stage_slug text,
  n_transitions bigint,
  avg_seconds numeric,
  median_seconds numeric,
  p90_seconds numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    i::int AS segment_index,
    p_stage_path[i]   AS from_stage_slug,
    p_stage_path[i+1] AS to_stage_slug,
    s.n_transitions, s.avg_seconds, s.median_seconds, s.p90_seconds
  FROM generate_series(1, array_length(p_stage_path,1)-1) AS i
  CROSS JOIN LATERAL public.get_avg_time_between_stages(
    p_stage_path[i], p_stage_path[i+1], p_consecutive_only, NULL, NULL
  ) AS s;
$$;
GRANT EXECUTE ON FUNCTION public.get_funnel_velocity(text[],boolean) TO authenticated, service_role;

-- Initial populate
SELECT public.refresh_deal_stage_metrics();