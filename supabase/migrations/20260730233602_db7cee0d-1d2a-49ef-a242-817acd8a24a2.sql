CREATE OR REPLACE FUNCTION public.search_claap_recordings(
  _q text DEFAULT NULL,
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL,
  _limit int DEFAULT 200
)
RETURNS TABLE (
  external_id text,
  title text,
  started_at timestamptz,
  organizer_email text,
  participants jsonb,
  source_payload jsonb,
  transcript_url text,
  recording_url text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT r.external_id, r.title, r.started_at, r.organizer_email,
         r.participants, r.source_payload, r.transcript_url, r.recording_url
  FROM public.claap_recordings r
  WHERE (_from IS NULL OR r.started_at >= _from)
    AND (_to IS NULL OR r.started_at <= _to)
    AND (
      _q IS NULL OR btrim(_q) = '' OR
      r.title ILIKE '%' || btrim(_q) || '%' OR
      r.organizer_email ILIKE '%' || btrim(_q) || '%' OR
      r.recording_url ILIKE '%' || btrim(_q) || '%' OR
      COALESCE(r.participants::text, '') ILIKE '%' || btrim(_q) || '%'
    )
  ORDER BY r.started_at DESC NULLS LAST
  LIMIT LEAST(COALESCE(_limit, 200), 500)
$$;

GRANT EXECUTE ON FUNCTION public.search_claap_recordings(text, timestamptz, timestamptz, int) TO authenticated;