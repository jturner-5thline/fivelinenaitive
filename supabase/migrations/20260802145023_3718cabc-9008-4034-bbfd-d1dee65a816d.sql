CREATE OR REPLACE FUNCTION public.api_usage_frequency(
  _start timestamptz,
  _end timestamptz,
  _provider text DEFAULT NULL
)
RETURNS TABLE (
  feature text,
  provider text,
  calls bigint,
  active_days bigint,
  active_hours bigint,
  calls_per_day numeric,
  calls_per_active_day numeric,
  peak_hour_calls bigint,
  peak_hour_at timestamptz,
  median_gap_minutes numeric,
  min_gap_seconds numeric,
  burst_calls bigint,
  distinct_users bigint,
  first_call_at timestamptz,
  last_call_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ev AS (
    SELECT c.created_at,
           'anthropic'::text AS provider,
           c.feature,
           c.user_id
    FROM public.claude_usage_logs c
    WHERE public.is_fifth_line_internal_admin()
      AND c.created_at >= _start AND c.created_at < _end
    UNION ALL
    SELECT a.created_at,
           CASE
             WHEN a.model ILIKE 'claude%' OR a.model ILIKE 'anthropic%' THEN 'anthropic'
             WHEN a.model ILIKE 'google/%' OR a.model ILIKE 'gemini%' THEN 'google'
             WHEN a.model ILIKE 'openai/%' OR a.model ILIKE 'gpt%' OR a.model ILIKE 'o1%' THEN 'openai'
             WHEN a.model ILIKE 'perplexity%' OR a.model ILIKE 'sonar%' THEN 'perplexity'
             ELSE 'other'
           END,
           a.feature,
           a.user_id
    FROM public.ai_usage_logs a
    WHERE public.is_fifth_line_internal_admin()
      AND a.created_at >= _start AND a.created_at < _end
  ),
  filtered AS (
    SELECT * FROM ev WHERE (_provider IS NULL OR ev.provider = _provider)
  ),
  gaps AS (
    SELECT f.feature,
           f.provider,
           EXTRACT(EPOCH FROM (f.created_at - LAG(f.created_at) OVER (PARTITION BY f.feature, f.provider ORDER BY f.created_at))) AS gap_s
    FROM filtered f
  ),
  gap_stats AS (
    SELECT feature, provider,
           ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gap_s) / 60.0)::numeric, 2) AS median_gap_minutes,
           ROUND(MIN(gap_s)::numeric, 1) AS min_gap_seconds,
           COUNT(*) FILTER (WHERE gap_s IS NOT NULL AND gap_s <= 60)::bigint AS burst_calls
    FROM gaps
    GROUP BY feature, provider
  ),
  hourly AS (
    SELECT feature, provider, date_trunc('hour', created_at) AS hr, COUNT(*)::bigint AS n
    FROM filtered
    GROUP BY 1, 2, 3
  ),
  peak AS (
    SELECT DISTINCT ON (feature, provider) feature, provider, hr, n
    FROM hourly
    ORDER BY feature, provider, n DESC, hr DESC
  ),
  base AS (
    SELECT feature, provider,
           COUNT(*)::bigint AS calls,
           COUNT(DISTINCT date_trunc('day', created_at))::bigint AS active_days,
           COUNT(DISTINCT date_trunc('hour', created_at))::bigint AS active_hours,
           COUNT(DISTINCT user_id)::bigint AS distinct_users,
           MIN(created_at) AS first_call_at,
           MAX(created_at) AS last_call_at
    FROM filtered
    GROUP BY 1, 2
  )
  SELECT b.feature,
         b.provider,
         b.calls,
         b.active_days,
         b.active_hours,
         ROUND(b.calls / GREATEST(EXTRACT(EPOCH FROM (_end - _start)) / 86400.0, 0.0001)::numeric, 2) AS calls_per_day,
         ROUND(b.calls::numeric / GREATEST(b.active_days, 1), 2) AS calls_per_active_day,
         COALESCE(p.n, 0)::bigint AS peak_hour_calls,
         p.hr AS peak_hour_at,
         g.median_gap_minutes,
         g.min_gap_seconds,
         COALESCE(g.burst_calls, 0)::bigint AS burst_calls,
         b.distinct_users,
         b.first_call_at,
         b.last_call_at
  FROM base b
  LEFT JOIN peak p ON p.feature = b.feature AND p.provider = b.provider
  LEFT JOIN gap_stats g ON g.feature = b.feature AND g.provider = b.provider
  ORDER BY b.calls DESC;
$$;

REVOKE ALL ON FUNCTION public.api_usage_frequency(timestamptz, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.api_usage_frequency(timestamptz, timestamptz, text) TO authenticated;