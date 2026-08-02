-- Unified AI/LLM usage reporting across providers (internal admins only).

CREATE OR REPLACE FUNCTION public.api_usage_events(_since timestamptz)
RETURNS TABLE (
  created_at timestamptz,
  provider text,
  feature text,
  model text,
  calls bigint,
  input_tokens bigint,
  output_tokens bigint,
  errors bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.created_at,
         'anthropic'::text AS provider,
         c.feature,
         c.model,
         1::bigint,
         COALESCE(c.input_tokens, 0)::bigint + COALESCE(c.prompt_cache_read_tokens, 0)::bigint + COALESCE(c.prompt_cache_create_tokens, 0)::bigint,
         COALESCE(c.output_tokens, 0)::bigint,
         CASE WHEN c.status <> 'success' THEN 1 ELSE 0 END::bigint
  FROM public.claude_usage_logs c
  WHERE public.is_fifth_line_internal_admin()
    AND c.created_at >= _since
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
         1::bigint,
         COALESCE(a.input_tokens, 0)::bigint,
         COALESCE(a.output_tokens, 0)::bigint,
         CASE WHEN a.status <> 'success' THEN 1 ELSE 0 END::bigint
  FROM public.ai_usage_logs a
  WHERE public.is_fifth_line_internal_admin()
    AND a.created_at >= _since;
$$;

-- Time series bucketed by hour or day for the trend charts.
CREATE OR REPLACE FUNCTION public.api_usage_timeseries(_hours integer DEFAULT 24, _bucket text DEFAULT 'hour')
RETURNS TABLE (
  bucket timestamptz,
  provider text,
  calls bigint,
  input_tokens bigint,
  output_tokens bigint,
  errors bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT date_trunc(CASE WHEN _bucket = 'day' THEN 'day' ELSE 'hour' END, e.created_at) AS bucket,
         e.provider,
         SUM(e.calls)::bigint,
         SUM(e.input_tokens)::bigint,
         SUM(e.output_tokens)::bigint,
         SUM(e.errors)::bigint
  FROM public.api_usage_events(now() - make_interval(hours => GREATEST(_hours, 1))) e
  GROUP BY 1, 2
  ORDER BY 1;
$$;

-- Which actions/features called the LLM in the window.
CREATE OR REPLACE FUNCTION public.api_usage_by_feature(_hours integer DEFAULT 24)
RETURNS TABLE (
  feature text,
  provider text,
  model text,
  calls bigint,
  input_tokens bigint,
  output_tokens bigint,
  errors bigint,
  last_call_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.feature,
         e.provider,
         (array_agg(e.model ORDER BY e.created_at DESC))[1] AS model,
         SUM(e.calls)::bigint,
         SUM(e.input_tokens)::bigint,
         SUM(e.output_tokens)::bigint,
         SUM(e.errors)::bigint,
         MAX(e.created_at)
  FROM public.api_usage_events(now() - make_interval(hours => GREATEST(_hours, 1))) e
  GROUP BY 1, 2
  ORDER BY SUM(e.calls) DESC;
$$;

-- Quarterly rollup (last N quarters).
CREATE OR REPLACE FUNCTION public.api_usage_by_quarter(_quarters integer DEFAULT 8)
RETURNS TABLE (
  bucket timestamptz,
  provider text,
  calls bigint,
  input_tokens bigint,
  output_tokens bigint,
  errors bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT date_trunc('quarter', e.created_at) AS bucket,
         e.provider,
         SUM(e.calls)::bigint,
         SUM(e.input_tokens)::bigint,
         SUM(e.output_tokens)::bigint,
         SUM(e.errors)::bigint
  FROM public.api_usage_events(
         date_trunc('quarter', now()) - make_interval(months => 3 * GREATEST(_quarters - 1, 0))
       ) e
  GROUP BY 1, 2
  ORDER BY 1;
$$;

REVOKE ALL ON FUNCTION public.api_usage_events(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.api_usage_events(timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.api_usage_timeseries(integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.api_usage_by_feature(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.api_usage_by_quarter(integer) TO authenticated, service_role;