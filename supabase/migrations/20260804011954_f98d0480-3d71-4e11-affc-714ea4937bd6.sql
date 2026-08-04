CREATE OR REPLACE FUNCTION public.api_usage_efficiency_timeseries(
  _start timestamptz,
  _end timestamptz,
  _user_ids uuid[] DEFAULT NULL,
  _deal_classes text[] DEFAULT NULL,
  _engagement_types text[] DEFAULT NULL,
  _bucket text DEFAULT NULL
)
RETURNS TABLE (
  bucket_start timestamptz,
  bucket text,
  feature text,
  provider text,
  calls bigint,
  input_tokens bigint,
  output_tokens bigint,
  errors bigint,
  cache_read_tokens bigint,
  tokens_per_call numeric,
  error_rate numeric,
  cache_read_share numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH grain AS (
  SELECT COALESCE(
           NULLIF(LOWER(_bucket), ''),
           CASE WHEN _end - _start <= interval '3 days' THEN 'hour' ELSE 'day' END
         ) AS g
), scoped_deals AS (
  SELECT d.id FROM public.deals d
  WHERE (_deal_classes IS NULL OR d.deal_class = ANY(_deal_classes))
    AND (_engagement_types IS NULL OR d.engagement_type = ANY(_engagement_types))
), raw AS (
  SELECT c.created_at, 'anthropic'::text AS provider, c.feature,
         COALESCE(c.input_tokens,0)::bigint + COALESCE(c.prompt_cache_read_tokens,0)::bigint + COALESCE(c.prompt_cache_create_tokens,0)::bigint AS input_tokens,
         COALESCE(c.output_tokens,0)::bigint AS output_tokens,
         COALESCE(c.prompt_cache_read_tokens,0)::bigint AS cache_read_tokens,
         CASE WHEN c.status <> 'success' THEN 1 ELSE 0 END::bigint AS errors
  FROM public.claude_usage_logs c
  WHERE public.is_fifth_line_internal_admin()
    AND c.created_at >= _start AND c.created_at < _end
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
         a.feature,
         COALESCE(a.input_tokens,0)::bigint, COALESCE(a.output_tokens,0)::bigint, 0::bigint,
         CASE WHEN a.status <> 'success' THEN 1 ELSE 0 END::bigint
  FROM public.ai_usage_logs a
  WHERE public.is_fifth_line_internal_admin()
    AND a.created_at >= _start AND a.created_at < _end
    AND (_user_ids IS NULL OR a.user_id = ANY(_user_ids))
    AND _deal_classes IS NULL AND _engagement_types IS NULL
)
SELECT date_trunc((SELECT g FROM grain), r.created_at) AS bucket_start,
       (SELECT g FROM grain) AS bucket,
       r.feature,
       r.provider,
       COUNT(*)::bigint,
       SUM(r.input_tokens)::bigint,
       SUM(r.output_tokens)::bigint,
       SUM(r.errors)::bigint,
       SUM(r.cache_read_tokens)::bigint,
       ROUND(SUM(r.input_tokens + r.output_tokens)::numeric / NULLIF(COUNT(*),0), 1),
       ROUND(100.0 * SUM(r.errors)::numeric / NULLIF(COUNT(*),0), 2),
       ROUND(100.0 * SUM(r.cache_read_tokens)::numeric / NULLIF(SUM(r.input_tokens),0), 2)
FROM raw r
GROUP BY 1, 2, 3, 4
ORDER BY 1 ASC;
$$;

REVOKE ALL ON FUNCTION public.api_usage_efficiency_timeseries(timestamptz, timestamptz, uuid[], text[], text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.api_usage_efficiency_timeseries(timestamptz, timestamptz, uuid[], text[], text[], text) TO authenticated;