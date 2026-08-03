CREATE TABLE IF NOT EXISTS public.claap_api_call_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  usage_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  source text NOT NULL DEFAULT 'unknown',
  operation text NOT NULL DEFAULT 'get_recording',
  outcome text NOT NULL DEFAULT 'call',
  skipped_reason text,
  priority text,
  external_id text,
  recording_id uuid,
  deal_id uuid,
  latency_ms integer,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.claap_api_call_log TO authenticated;
GRANT ALL ON public.claap_api_call_log TO service_role;

ALTER TABLE public.claap_api_call_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read Claap call log" ON public.claap_api_call_log;
CREATE POLICY "Authenticated users can read Claap call log"
  ON public.claap_api_call_log FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS claap_api_call_log_date_idx ON public.claap_api_call_log (usage_date DESC);
CREATE INDEX IF NOT EXISTS claap_api_call_log_source_idx ON public.claap_api_call_log (source, operation);
CREATE INDEX IF NOT EXISTS claap_api_call_log_occurred_idx ON public.claap_api_call_log (occurred_at DESC);

CREATE OR REPLACE FUNCTION public.claap_usage_drilldown(_start date, _end date)
RETURNS TABLE (
  source text,
  operation text,
  calls bigint,
  billable_calls bigint,
  skipped_calls bigint,
  rate_limited bigint,
  errors bigint,
  hydrate_skips bigint,
  distinct_recordings bigint,
  repeat_recordings bigint,
  avg_latency_ms numeric,
  first_call_at timestamptz,
  last_call_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT * FROM public.claap_api_call_log
    WHERE usage_date >= _start AND usage_date <= _end
  )
  SELECT
    s.source,
    s.operation,
    count(*)::bigint AS calls,
    count(*) FILTER (WHERE s.outcome IN ('call','rate_limited','error'))::bigint AS billable_calls,
    count(*) FILTER (WHERE s.outcome = 'skipped')::bigint AS skipped_calls,
    count(*) FILTER (WHERE s.outcome = 'rate_limited')::bigint AS rate_limited,
    count(*) FILTER (WHERE s.outcome = 'error')::bigint AS errors,
    count(*) FILTER (WHERE s.skipped_reason = 'already_hydrated')::bigint AS hydrate_skips,
    count(DISTINCT coalesce(s.external_id, s.recording_id::text))::bigint AS distinct_recordings,
    GREATEST(
      count(*) FILTER (WHERE s.outcome IN ('call','rate_limited','error'))
      - count(DISTINCT coalesce(s.external_id, s.recording_id::text))
        FILTER (WHERE s.outcome IN ('call','rate_limited','error')),
      0
    )::bigint AS repeat_recordings,
    round(avg(s.latency_ms)::numeric, 0) AS avg_latency_ms,
    min(s.occurred_at) AS first_call_at,
    max(s.occurred_at) AS last_call_at
  FROM scoped s
  GROUP BY s.source, s.operation
  ORDER BY billable_calls DESC;
$$;

GRANT EXECUTE ON FUNCTION public.claap_usage_drilldown(date, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.claap_log_api_call(
  _source text,
  _operation text DEFAULT 'get_recording',
  _outcome text DEFAULT 'call',
  _skipped_reason text DEFAULT NULL,
  _priority text DEFAULT NULL,
  _external_id text DEFAULT NULL,
  _recording_id uuid DEFAULT NULL,
  _deal_id uuid DEFAULT NULL,
  _latency_ms integer DEFAULT NULL,
  _error_message text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.claap_api_call_log(
    source, operation, outcome, skipped_reason, priority,
    external_id, recording_id, deal_id, latency_ms, error_message
  ) VALUES (
    coalesce(_source, 'unknown'), coalesce(_operation, 'get_recording'),
    coalesce(_outcome, 'call'), _skipped_reason, _priority,
    _external_id, _recording_id, _deal_id, _latency_ms, left(_error_message, 500)
  );

  DELETE FROM public.claap_api_call_log
  WHERE usage_date < (now() AT TIME ZONE 'utc')::date - 90;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claap_log_api_call(text, text, text, text, text, text, uuid, uuid, integer, text) TO service_role;