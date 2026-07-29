-- Claude usage observability log
CREATE TABLE IF NOT EXISTS public.claude_usage_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id      UUID,
  company_id   UUID,
  deal_id      UUID,
  feature      TEXT NOT NULL DEFAULT 'chat',
  prompt_mode  TEXT,
  signature    TEXT,
  cache_mode   TEXT,
  cache_status TEXT NOT NULL DEFAULT 'off',   -- hit | miss | refresh | off
  cache_hit    BOOLEAN NOT NULL DEFAULT false,
  model        TEXT,
  latency_ms   INTEGER,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  prompt_cache_read_tokens   INTEGER,
  prompt_cache_create_tokens INTEGER,
  status       TEXT NOT NULL DEFAULT 'success', -- success | error
  http_status  INTEGER,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS claude_usage_logs_created_at_idx
  ON public.claude_usage_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS claude_usage_logs_feature_created_idx
  ON public.claude_usage_logs (feature, created_at DESC);
CREATE INDEX IF NOT EXISTS claude_usage_logs_signature_idx
  ON public.claude_usage_logs (signature) WHERE signature IS NOT NULL;
CREATE INDEX IF NOT EXISTS claude_usage_logs_company_created_idx
  ON public.claude_usage_logs (company_id, created_at DESC);

GRANT SELECT ON public.claude_usage_logs TO authenticated;
GRANT ALL    ON public.claude_usage_logs TO service_role;

ALTER TABLE public.claude_usage_logs ENABLE ROW LEVEL SECURITY;

-- Internal-only visibility. Writes happen exclusively from the
-- claude-gateway edge function via service_role, which bypasses RLS.
CREATE POLICY "Internal admins can read claude usage logs"
  ON public.claude_usage_logs
  FOR SELECT
  TO authenticated
  USING (public.is_fifth_line_internal_admin());

-- ── Analytics helpers (SECURITY DEFINER, internal-gated) ─────────────

CREATE OR REPLACE FUNCTION public.claude_usage_daily_by_feature(_days INTEGER DEFAULT 14)
RETURNS TABLE (
  day             DATE,
  feature         TEXT,
  request_count   BIGINT,
  cache_hits      BIGINT,
  error_count     BIGINT,
  input_tokens    BIGINT,
  output_tokens   BIGINT,
  avg_latency_ms  NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (created_at AT TIME ZONE 'UTC')::date AS day,
    feature,
    COUNT(*)::bigint AS request_count,
    COUNT(*) FILTER (WHERE cache_hit)::bigint AS cache_hits,
    COUNT(*) FILTER (WHERE status = 'error')::bigint AS error_count,
    COALESCE(SUM(input_tokens), 0)::bigint AS input_tokens,
    COALESCE(SUM(output_tokens), 0)::bigint AS output_tokens,
    ROUND(AVG(latency_ms)::numeric, 1) AS avg_latency_ms
  FROM public.claude_usage_logs
  WHERE public.is_fifth_line_internal_admin()
    AND created_at >= now() - make_interval(days => GREATEST(_days, 1))
  GROUP BY 1, 2
  ORDER BY 1 DESC, request_count DESC;
$$;

CREATE OR REPLACE FUNCTION public.claude_usage_top_signatures(
  _days  INTEGER DEFAULT 7,
  _limit INTEGER DEFAULT 25
)
RETURNS TABLE (
  signature        TEXT,
  feature          TEXT,
  prompt_mode      TEXT,
  cache_mode       TEXT,
  request_count    BIGINT,
  cache_hits       BIGINT,
  distinct_users   BIGINT,
  distinct_deals   BIGINT,
  last_seen_at     TIMESTAMPTZ,
  avg_latency_ms   NUMERIC,
  total_output_tokens BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    signature,
    MAX(feature)     AS feature,
    MAX(prompt_mode) AS prompt_mode,
    MAX(cache_mode)  AS cache_mode,
    COUNT(*)::bigint AS request_count,
    COUNT(*) FILTER (WHERE cache_hit)::bigint AS cache_hits,
    COUNT(DISTINCT user_id)::bigint AS distinct_users,
    COUNT(DISTINCT deal_id) FILTER (WHERE deal_id IS NOT NULL)::bigint AS distinct_deals,
    MAX(created_at) AS last_seen_at,
    ROUND(AVG(latency_ms)::numeric, 1) AS avg_latency_ms,
    COALESCE(SUM(output_tokens), 0)::bigint AS total_output_tokens
  FROM public.claude_usage_logs
  WHERE public.is_fifth_line_internal_admin()
    AND signature IS NOT NULL
    AND created_at >= now() - make_interval(days => GREATEST(_days, 1))
  GROUP BY signature
  HAVING COUNT(*) > 1
  ORDER BY request_count DESC, last_seen_at DESC
  LIMIT GREATEST(_limit, 1);
$$;

CREATE OR REPLACE FUNCTION public.claude_usage_totals(_days INTEGER DEFAULT 14)
RETURNS TABLE (
  request_count  BIGINT,
  cache_hits     BIGINT,
  error_count    BIGINT,
  input_tokens   BIGINT,
  output_tokens  BIGINT,
  avg_latency_ms NUMERIC,
  distinct_users BIGINT,
  distinct_features BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE cache_hit)::bigint,
    COUNT(*) FILTER (WHERE status = 'error')::bigint,
    COALESCE(SUM(input_tokens), 0)::bigint,
    COALESCE(SUM(output_tokens), 0)::bigint,
    ROUND(AVG(latency_ms)::numeric, 1),
    COUNT(DISTINCT user_id)::bigint,
    COUNT(DISTINCT feature)::bigint
  FROM public.claude_usage_logs
  WHERE public.is_fifth_line_internal_admin()
    AND created_at >= now() - make_interval(days => GREATEST(_days, 1));
$$;

REVOKE ALL ON FUNCTION public.claude_usage_daily_by_feature(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claude_usage_top_signatures(INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claude_usage_totals(INTEGER) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.claude_usage_daily_by_feature(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claude_usage_top_signatures(INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claude_usage_totals(INTEGER) TO authenticated;