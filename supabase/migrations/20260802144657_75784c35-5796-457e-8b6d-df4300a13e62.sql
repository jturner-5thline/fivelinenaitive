CREATE OR REPLACE FUNCTION public.api_usage_calls(
  _start timestamptz,
  _end timestamptz,
  _feature text DEFAULT NULL,
  _provider text DEFAULT NULL,
  _limit int DEFAULT 200
)
RETURNS TABLE (
  created_at timestamptz,
  provider text,
  feature text,
  action text,
  detail text,
  model text,
  deal_id uuid,
  deal_name text,
  user_id uuid,
  user_name text,
  input_tokens bigint,
  output_tokens bigint,
  cache_read_tokens bigint,
  latency_ms integer,
  status text,
  error_message text
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
           COALESCE(split_part(c.prompt_mode, ' · ', 1), 'call') AS action,
           NULLIF(concat_ws(' · ', NULLIF(split_part(COALESCE(c.prompt_mode,''), ' · ', 2), ''), c.signature), '') AS detail,
           c.model,
           c.deal_id,
           c.user_id,
           COALESCE(c.input_tokens,0)::bigint AS input_tokens,
           COALESCE(c.output_tokens,0)::bigint AS output_tokens,
           COALESCE(c.prompt_cache_read_tokens,0)::bigint AS cache_read_tokens,
           c.latency_ms,
           c.status,
           c.error_message
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
           'call'::text,
           NULL::text,
           a.model,
           NULL::uuid,
           a.user_id,
           COALESCE(a.input_tokens,0)::bigint,
           COALESCE(a.output_tokens,0)::bigint,
           0::bigint,
           NULL::integer,
           a.status,
           a.error_message
    FROM public.ai_usage_logs a
    WHERE public.is_fifth_line_internal_admin()
      AND a.created_at >= _start AND a.created_at < _end
  )
  SELECT ev.created_at,
         ev.provider,
         ev.feature,
         ev.action,
         ev.detail,
         ev.model,
         ev.deal_id,
         d.company AS deal_name,
         ev.user_id,
         COALESCE(NULLIF(TRIM(p.full_name), ''), p.email) AS user_name,
         ev.input_tokens,
         ev.output_tokens,
         ev.cache_read_tokens,
         ev.latency_ms,
         ev.status,
         ev.error_message
  FROM ev
  LEFT JOIN public.deals d ON d.id = ev.deal_id
  LEFT JOIN public.profiles p ON p.id = ev.user_id
  WHERE (_feature IS NULL OR ev.feature = _feature)
    AND (_provider IS NULL OR ev.provider = _provider)
  ORDER BY ev.created_at DESC
  LIMIT LEAST(COALESCE(_limit, 200), 1000);
$$;

REVOKE ALL ON FUNCTION public.api_usage_calls(timestamptz, timestamptz, text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.api_usage_calls(timestamptz, timestamptz, text, text, int) TO authenticated;