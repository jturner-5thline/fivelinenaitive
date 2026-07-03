
-- 1. Recording-level hydration + refresh-request tracking
ALTER TABLE public.claap_recordings
  ADD COLUMN IF NOT EXISTS hydrated_at timestamptz,
  ADD COLUMN IF NOT EXISTS hydration_complete boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS refresh_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS refresh_priority text NOT NULL DEFAULT 'normal'
    CHECK (refresh_priority IN ('high','normal','low'));

CREATE OR REPLACE FUNCTION public.claap_recordings_maintain_hydration()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- A recording is "hydrated" once we have a stored summary AND either a
  -- transcript URL or transcript_available flag. Action items may be empty
  -- for short calls, so we don't require them.
  IF NEW.summary IS NOT NULL
     AND length(NEW.summary) > 0
     AND (NEW.transcript_url IS NOT NULL OR NEW.transcript_available = true)
  THEN
    NEW.hydration_complete := true;
    IF NEW.hydrated_at IS NULL THEN
      NEW.hydrated_at := now();
    END IF;
  ELSE
    -- Do NOT flip back to false once true — a recording stays hydrated even
    -- if a later partial update momentarily nulls a field.
    IF NEW.hydration_complete IS NULL THEN
      NEW.hydration_complete := false;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS claap_recordings_hydration_trg ON public.claap_recordings;
CREATE TRIGGER claap_recordings_hydration_trg
BEFORE INSERT OR UPDATE OF summary, transcript_url, transcript_available
ON public.claap_recordings
FOR EACH ROW EXECUTE FUNCTION public.claap_recordings_maintain_hydration();

-- Backfill hydration flag for rows already complete.
UPDATE public.claap_recordings
SET hydration_complete = true,
    hydrated_at = COALESCE(hydrated_at, claap_summary_synced_at, updated_at)
WHERE summary IS NOT NULL
  AND length(summary) > 0
  AND (transcript_url IS NOT NULL OR transcript_available = true)
  AND hydration_complete = false;

CREATE INDEX IF NOT EXISTS idx_claap_recordings_hydration_incomplete
  ON public.claap_recordings (started_at DESC)
  WHERE hydration_complete = false;

CREATE INDEX IF NOT EXISTS idx_claap_recordings_refresh_requested
  ON public.claap_recordings (refresh_requested_at)
  WHERE refresh_requested_at IS NOT NULL AND hydration_complete = false;

-- 2. Daily API usage / quota tracking (UTC-day rows)
CREATE TABLE IF NOT EXISTS public.claap_api_usage (
  usage_date date PRIMARY KEY DEFAULT (now() AT TIME ZONE 'utc')::date,
  calls_made integer NOT NULL DEFAULT 0,
  daily_limit integer NOT NULL DEFAULT 1000,
  first_429_at timestamptz,
  last_429_at timestamptz,
  last_call_at timestamptz,
  reset_at timestamptz NOT NULL DEFAULT (((now() AT TIME ZONE 'utc')::date + 1) AT TIME ZONE 'utc'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.claap_api_usage TO authenticated;
GRANT ALL ON public.claap_api_usage TO service_role;

ALTER TABLE public.claap_api_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read Claap quota status"
ON public.claap_api_usage FOR SELECT
TO authenticated
USING (true);

-- 3. Helper: record a Claap API call (called from edge functions after each fetch)
CREATE OR REPLACE FUNCTION public.claap_record_api_call(_count integer DEFAULT 1)
RETURNS TABLE(calls_made integer, daily_limit integer, protect_mode boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _today date := (now() AT TIME ZONE 'utc')::date;
  _row public.claap_api_usage%ROWTYPE;
BEGIN
  INSERT INTO public.claap_api_usage(usage_date, calls_made, last_call_at)
  VALUES (_today, _count, now())
  ON CONFLICT (usage_date) DO UPDATE
    SET calls_made = public.claap_api_usage.calls_made + EXCLUDED.calls_made,
        last_call_at = now(),
        updated_at = now()
  RETURNING * INTO _row;

  RETURN QUERY SELECT
    _row.calls_made,
    _row.daily_limit,
    (_row.calls_made::float / GREATEST(_row.daily_limit,1)::float) >= 0.8
      OR _row.first_429_at IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claap_record_api_call(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claap_record_api_call(integer) TO service_role;

-- 4. Helper: mark that we just hit a 429
CREATE OR REPLACE FUNCTION public.claap_mark_rate_limited()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _today date := (now() AT TIME ZONE 'utc')::date;
BEGIN
  INSERT INTO public.claap_api_usage(usage_date, calls_made, first_429_at, last_429_at)
  VALUES (_today, 0, now(), now())
  ON CONFLICT (usage_date) DO UPDATE
    SET first_429_at = COALESCE(public.claap_api_usage.first_429_at, now()),
        last_429_at = now(),
        updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.claap_mark_rate_limited() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claap_mark_rate_limited() TO service_role;

-- 5. Helper: current quota status (readable by clients for the banner)
CREATE OR REPLACE FUNCTION public.claap_quota_status()
RETURNS TABLE(
  usage_date date,
  calls_made integer,
  daily_limit integer,
  first_429_at timestamptz,
  reset_at timestamptz,
  protect_mode boolean,
  out_of_quota boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.usage_date,
    u.calls_made,
    u.daily_limit,
    u.first_429_at,
    u.reset_at,
    (u.calls_made::float / GREATEST(u.daily_limit,1)::float) >= 0.8
      OR u.first_429_at IS NOT NULL AS protect_mode,
    (u.first_429_at IS NOT NULL) AS out_of_quota
  FROM public.claap_api_usage u
  WHERE u.usage_date = (now() AT TIME ZONE 'utc')::date;
$$;

REVOKE ALL ON FUNCTION public.claap_quota_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claap_quota_status() TO authenticated, service_role;
