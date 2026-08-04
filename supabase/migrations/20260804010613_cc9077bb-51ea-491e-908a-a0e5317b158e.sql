CREATE OR REPLACE FUNCTION public.api_usage_efficiency_by_activity(_start timestamptz, _end timestamptz)
RETURNS TABLE(
  feature text,
  provider text,
  calls bigint,
  input_tokens bigint,
  output_tokens bigint,
  errors bigint,
  cache_read_tokens bigint,
  distinct_users bigint,
  distinct_deals bigint,
  distinct_days bigint,
  tokens_per_call numeric,
  error_rate numeric,
  cache_read_share numeric,
  calls_per_deal numeric,
  calls_per_user numeric,
  prev_calls bigint,
  prev_tokens_per_call numeric,
  prev_calls_per_deal numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH span AS (
  SELECT GREATEST(_end - _start, interval '1 minute') AS len
), raw AS (
  SELECT c.created_at, 'anthropic'::text AS provider, c.feature, c.user_id, c.deal_id,
         COALESCE(c.input_tokens,0)::bigint + COALESCE(c.prompt_cache_read_tokens,0)::bigint + COALESCE(c.prompt_cache_create_tokens,0)::bigint AS input_tokens,
         COALESCE(c.output_tokens,0)::bigint AS output_tokens,
         COALESCE(c.prompt_cache_read_tokens,0)::bigint AS cache_read_tokens,
         CASE WHEN c.status <> 'success' THEN 1 ELSE 0 END::bigint AS errors
  FROM public.claude_usage_logs c
  WHERE public.is_fifth_line_internal_admin()
    AND c.created_at >= _start - (SELECT len FROM span) AND c.created_at < _end
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
$function$;

GRANT EXECUTE ON FUNCTION public.api_usage_efficiency_by_activity(timestamptz, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.claap_usage_efficiency_by_activity(_start timestamptz, _end timestamptz)
RETURNS TABLE(
  source text,
  operation text,
  calls bigint,
  skipped bigint,
  errors bigint,
  distinct_recordings bigint,
  distinct_deals bigint,
  distinct_days bigint,
  calls_per_recording numeric,
  redundant_calls bigint,
  skip_rate numeric,
  error_rate numeric,
  avg_latency_ms numeric,
  prev_calls bigint,
  prev_calls_per_recording numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH span AS (
  SELECT GREATEST(_end - _start, interval '1 minute') AS len
), raw AS (
  SELECT l.* FROM public.claap_api_call_log l
  WHERE l.occurred_at >= _start - (SELECT len FROM span) AND l.occurred_at < _end
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
$function$;

GRANT EXECUTE ON FUNCTION public.claap_usage_efficiency_by_activity(timestamptz, timestamptz) TO authenticated;