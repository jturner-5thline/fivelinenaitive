CREATE OR REPLACE FUNCTION public.api_usage_drilldown(
  _start timestamptz,
  _end timestamptz,
  _provider text DEFAULT NULL
)
RETURNS TABLE(
  feature text,
  provider text,
  model text,
  calls bigint,
  input_tokens bigint,
  output_tokens bigint,
  cache_read_tokens bigint,
  cache_create_tokens bigint,
  cache_hits bigint,
  errors bigint,
  avg_latency_ms numeric,
  distinct_signatures bigint,
  repeat_calls bigint,
  distinct_users bigint,
  first_call_at timestamptz,
  last_call_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH ev AS (
    SELECT c.created_at,
           'anthropic'::text AS provider,
           c.feature,
           c.model,
           COALESCE(c.input_tokens,0)::bigint AS input_tokens,
           COALESCE(c.output_tokens,0)::bigint AS output_tokens,
           COALESCE(c.prompt_cache_read_tokens,0)::bigint AS cache_read_tokens,
           COALESCE(c.prompt_cache_create_tokens,0)::bigint AS cache_create_tokens,
           CASE WHEN c.cache_hit THEN 1 ELSE 0 END::bigint AS cache_hit,
           CASE WHEN c.status <> 'success' THEN 1 ELSE 0 END::bigint AS err,
           c.latency_ms,
           c.signature,
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
           a.model,
           COALESCE(a.input_tokens,0)::bigint,
           COALESCE(a.output_tokens,0)::bigint,
           0::bigint,
           0::bigint,
           0::bigint,
           CASE WHEN a.status <> 'success' THEN 1 ELSE 0 END::bigint,
           NULL::integer,
           NULL::text,
           a.user_id
    FROM public.ai_usage_logs a
    WHERE public.is_fifth_line_internal_admin()
      AND a.created_at >= _start AND a.created_at < _end
  )
  SELECT ev.feature,
         ev.provider,
         ev.model,
         COUNT(*)::bigint,
         SUM(ev.input_tokens)::bigint,
         SUM(ev.output_tokens)::bigint,
         SUM(ev.cache_read_tokens)::bigint,
         SUM(ev.cache_create_tokens)::bigint,
         SUM(ev.cache_hit)::bigint,
         SUM(ev.err)::bigint,
         ROUND(AVG(ev.latency_ms)::numeric, 0),
         COUNT(DISTINCT ev.signature)::bigint,
         GREATEST(COUNT(*) FILTER (WHERE ev.signature IS NOT NULL) - COUNT(DISTINCT ev.signature), 0)::bigint,
         COUNT(DISTINCT ev.user_id)::bigint,
         MIN(ev.created_at),
         MAX(ev.created_at)
  FROM ev
  WHERE _provider IS NULL OR ev.provider = _provider
  GROUP BY 1,2,3
  ORDER BY COUNT(*) DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.api_usage_drilldown(timestamptz, timestamptz, text) TO authenticated;