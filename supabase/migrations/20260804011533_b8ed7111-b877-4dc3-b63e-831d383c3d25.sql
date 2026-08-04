DROP FUNCTION IF EXISTS public.api_usage_efficiency_by_activity(timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.claap_usage_efficiency_by_activity(timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.api_usage_efficiency_by_activity(
  _start timestamptz,
  _end timestamptz,
  _user_ids uuid[] DEFAULT NULL,
  _deal_classes text[] DEFAULT NULL,
  _engagement_types text[] DEFAULT NULL
)
RETURNS TABLE (
  feature text, provider text, calls bigint, input_tokens bigint, output_tokens bigint,
  errors bigint, cache_read_tokens bigint, distinct_users bigint, distinct_deals bigint,
  distinct_days bigint, tokens_per_call numeric, error_rate numeric, cache_read_share numeric,
  calls_per_deal numeric, calls_per_user numeric, prev_calls bigint,
  prev_tokens_per_call numeric, prev_calls_per_deal numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH span AS (
  SELECT GREATEST(_end - _start, interval '1 minute') AS len
), scoped_deals AS (
  SELECT d.id FROM public.deals d
  WHERE (_deal_classes IS NULL OR d.deal_class = ANY(_deal_classes))
    AND (_engagement_types IS NULL OR d.engagement_type = ANY(_engagement_types))
), raw AS (
  SELECT c.created_at, 'anthropic'::text AS provider, c.feature, c.user_id, c.deal_id,
         COALESCE(c.input_tokens,0)::bigint + COALESCE(c.prompt_cache_read_tokens,0)::bigint + COALESCE(c.prompt_cache_create_tokens,0)::bigint AS input_tokens,
         COALESCE(c.output_tokens,0)::bigint AS output_tokens,
         COALESCE(c.prompt_cache_read_tokens,0)::bigint AS cache_read_tokens,
         CASE WHEN c.status <> 'success' THEN 1 ELSE 0 END::bigint AS errors
  FROM public.claude_usage_logs c
  WHERE public.is_fifth_line_internal_admin()
    AND c.created_at >= _start - (SELECT len FROM span) AND c.created_at < _end
    AND (_user_ids IS NULL OR c.user_id = ANY(_user_ids))
    AND (
      (_deal_classes IS NULL AND _engagement_types IS NULL)
      OR c.deal_id IN (SELECT id FROM scoped_deals)
    )
  UNION ALL
  SELECT a.created_at,
         CASE
           WHEN a.model ILIKE 'claude%' OR a.model ILIKE 'anthropic%' THEN 'anthropic'
           WHEN a.model ILIKE 'google/%' OR a.model ILIKE 'gemini%' THEN 'google'
           WHEN a.model ILIKE 'openai/%' OR a.model ILIKE 'gpt%' OR a.model ILIKE 'o1%' THEN 'openai'
           WHEN a.model ILIKE 'perplexity%' OR a.model ILIKE 'sonar%' THEN 'perplexity'
           ELSE 'other'
         END,
         a.feature, a.user_id, NULL::uuid,
         COALESCE(a.input_tokens,0)::bigint, COALESCE(a.output_tokens,0)::bigint, 0::bigint,
         CASE WHEN a.status <> 'success' THEN 1 ELSE 0 END::bigint
  FROM public.ai_usage_logs a
  WHERE public.is_fifth_line_internal_admin()
    AND a.created_at >= _start - (SELECT len FROM span) AND a.created_at < _end
    AND (_user_ids IS NULL OR a.user_id = ANY(_user_ids))
    AND _deal_classes IS NULL AND _engagement_types IS NULL
), cur AS (
  SELECT r.feature, r.provider,
         COUNT(*)::bigint AS calls,
         SUM(r.input_tokens)::bigint AS input_tokens,
         SUM(r.output_tokens)::bigint AS output_tokens,
         SUM(r.errors)::bigint AS errors,
         SUM(r.cache_read_tokens)::bigint AS cache_read_tokens,
         COUNT(DISTINCT r.user_id)::bigint AS distinct_users,
         COUNT(DISTINCT r.deal_id)::bigint AS distinct_deals,
         COUNT(DISTINCT date_trunc('day', r.created_at))::bigint AS distinct_days
  FROM raw r WHERE r.created_at >= _start GROUP BY 1,2
), prev AS (
  SELECT r.feature, r.provider,
         COUNT(*)::bigint AS calls,
         SUM(r.input_tokens + r.output_tokens)::bigint AS tokens,
         COUNT(DISTINCT r.deal_id)::bigint AS distinct_deals
  FROM raw r WHERE r.created_at < _start GROUP BY 1,2
)
SELECT c.feature, c.provider, c.calls, c.input_tokens, c.output_tokens, c.errors,
       c.cache_read_tokens, c.distinct_users, c.distinct_deals, c.distinct_days,
       ROUND((c.input_tokens + c.output_tokens)::numeric / NULLIF(c.calls,0), 1),
       ROUND(100.0 * c.errors::numeric / NULLIF(c.calls,0), 2),
       ROUND(100.0 * c.cache_read_tokens::numeric / NULLIF(c.input_tokens,0), 2),
       ROUND(c.calls::numeric / NULLIF(c.distinct_deals,0), 2),
       ROUND(c.calls::numeric / NULLIF(c.distinct_users,0), 2),
       COALESCE(p.calls, 0),
       ROUND(p.tokens::numeric / NULLIF(p.calls,0), 1),
       ROUND(p.calls::numeric / NULLIF(p.distinct_deals,0), 2)
FROM cur c LEFT JOIN prev p ON p.feature = c.feature AND p.provider = c.provider
ORDER BY c.calls DESC;
$$;

CREATE OR REPLACE FUNCTION public.claap_usage_efficiency_by_activity(
  _start timestamptz,
  _end timestamptz,
  _deal_classes text[] DEFAULT NULL,
  _engagement_types text[] DEFAULT NULL
)
RETURNS TABLE (
  source text, operation text, calls bigint, skipped bigint, errors bigint,
  distinct_recordings bigint, distinct_deals bigint, distinct_days bigint,
  calls_per_recording numeric, redundant_calls bigint, skip_rate numeric,
  error_rate numeric, avg_latency_ms numeric, prev_calls bigint,
  prev_calls_per_recording numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH span AS (
  SELECT GREATEST(_end - _start, interval '1 minute') AS len
), scoped_deals AS (
  SELECT d.id FROM public.deals d
  WHERE (_deal_classes IS NULL OR d.deal_class = ANY(_deal_classes))
    AND (_engagement_types IS NULL OR d.engagement_type = ANY(_engagement_types))
), raw AS (
  SELECT l.* FROM public.claap_api_call_log l
  WHERE public.is_fifth_line_internal_admin()
    AND l.occurred_at >= _start - (SELECT len FROM span) AND l.occurred_at < _end
    AND (
      (_deal_classes IS NULL AND _engagement_types IS NULL)
      OR l.deal_id IN (SELECT id FROM scoped_deals)
    )
), cur AS (
  SELECT r.source, r.operation,
         COUNT(*) FILTER (WHERE r.outcome = 'call')::bigint AS calls,
         COUNT(*) FILTER (WHERE r.outcome = 'skipped')::bigint AS skipped,
         COUNT(*) FILTER (WHERE r.outcome NOT IN ('call','skipped'))::bigint AS errors,
         COUNT(DISTINCT r.external_id) FILTER (WHERE r.outcome = 'call')::bigint AS distinct_recordings,
         COUNT(DISTINCT r.deal_id)::bigint AS distinct_deals,
         COUNT(DISTINCT r.usage_date)::bigint AS distinct_days,
         AVG(r.latency_ms) FILTER (WHERE r.outcome = 'call') AS avg_latency
  FROM raw r WHERE r.occurred_at >= _start GROUP BY 1,2
), prev AS (
  SELECT r.source, r.operation,
         COUNT(*) FILTER (WHERE r.outcome = 'call')::bigint AS calls,
         COUNT(DISTINCT r.external_id) FILTER (WHERE r.outcome = 'call')::bigint AS distinct_recordings
  FROM raw r WHERE r.occurred_at < _start GROUP BY 1,2
)
SELECT c.source, c.operation, c.calls, c.skipped, c.errors,
       c.distinct_recordings, c.distinct_deals, c.distinct_days,
       ROUND(c.calls::numeric / NULLIF(c.distinct_recordings,0), 2),
       GREATEST(c.calls - c.distinct_recordings, 0)::bigint,
       ROUND(100.0 * c.skipped::numeric / NULLIF(c.calls + c.skipped,0), 2),
       ROUND(100.0 * c.errors::numeric / NULLIF(c.calls + c.errors,0), 2),
       ROUND(c.avg_latency::numeric, 0),
       COALESCE(p.calls, 0),
       ROUND(p.calls::numeric / NULLIF(p.distinct_recordings,0), 2)
FROM cur c LEFT JOIN prev p ON p.source = c.source AND p.operation = c.operation
ORDER BY c.calls DESC;
$$;

CREATE OR REPLACE FUNCTION public.api_usage_filter_options(
  _start timestamptz,
  _end timestamptz
)
RETURNS TABLE (kind text, value text, label text, calls bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH log_users AS (
  SELECT c.user_id, COUNT(*)::bigint AS calls
  FROM public.claude_usage_logs c
  WHERE public.is_fifth_line_internal_admin()
    AND c.created_at >= _start AND c.created_at < _end AND c.user_id IS NOT NULL
  GROUP BY 1
  UNION ALL
  SELECT a.user_id, COUNT(*)::bigint
  FROM public.ai_usage_logs a
  WHERE public.is_fifth_line_internal_admin()
    AND a.created_at >= _start AND a.created_at < _end AND a.user_id IS NOT NULL
  GROUP BY 1
), users AS (
  SELECT u.user_id, SUM(u.calls)::bigint AS calls FROM log_users u GROUP BY 1
)
SELECT 'user'::text,
       u.user_id::text,
       COALESCE(NULLIF(TRIM(p.display_name), ''), 'Unknown user'),
       u.calls
FROM users u
LEFT JOIN public.profiles p ON p.user_id = u.user_id
UNION ALL
SELECT 'deal_class'::text, d.deal_class, d.deal_class, COUNT(*)::bigint
FROM public.deals d
WHERE public.is_fifth_line_internal_admin() AND d.deal_class IS NOT NULL
GROUP BY d.deal_class
UNION ALL
SELECT 'engagement_type'::text, d.engagement_type, d.engagement_type, COUNT(*)::bigint
FROM public.deals d
WHERE public.is_fifth_line_internal_admin() AND NULLIF(TRIM(d.engagement_type), '') IS NOT NULL
GROUP BY d.engagement_type
ORDER BY 1, 4 DESC;
$$;

REVOKE ALL ON FUNCTION public.api_usage_efficiency_by_activity(timestamptz, timestamptz, uuid[], text[], text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claap_usage_efficiency_by_activity(timestamptz, timestamptz, text[], text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.api_usage_filter_options(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.api_usage_efficiency_by_activity(timestamptz, timestamptz, uuid[], text[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claap_usage_efficiency_by_activity(timestamptz, timestamptz, text[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.api_usage_filter_options(timestamptz, timestamptz) TO authenticated;