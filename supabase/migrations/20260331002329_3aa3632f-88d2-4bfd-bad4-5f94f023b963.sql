-- One-time rematch existing Claap meetings to deals by title and create missing linked artifacts/activity
WITH ranked_matches AS (
  SELECT
    cm.id AS meeting_id,
    cm.claap_id,
    cm.title,
    cm.recording_url,
    cm.transcript,
    cm.duration_seconds,
    cm.started_at,
    d.id AS deal_id,
    d.company AS deal_company,
    ROW_NUMBER() OVER (
      PARTITION BY cm.id
      ORDER BY length(coalesce(d.company, '')) DESC, d.updated_at DESC NULLS LAST, d.created_at DESC NULLS LAST
    ) AS rn
  FROM public.claap_meetings cm
  JOIN public.deals d
    ON d.status = 'active'
   AND d.company_id = cm.company_id
   AND cm.deal_id IS NULL
   AND cm.title IS NOT NULL
   AND lower(cm.title) LIKE '%' || lower(d.company) || '%'
),
updated_meetings AS (
  UPDATE public.claap_meetings cm
  SET
    deal_id = rm.deal_id,
    call_type = 'Deal Call',
    match_source = 'one_time_deal_title_rematch',
    updated_at = now()
  FROM ranked_matches rm
  WHERE cm.id = rm.meeting_id
    AND rm.rn = 1
  RETURNING cm.id, cm.claap_id, cm.title, cm.recording_url, cm.transcript, cm.duration_seconds, cm.started_at, cm.deal_id, cm.call_type
),
inserted_recordings AS (
  INSERT INTO public.deal_claap_recordings (
    deal_id,
    recording_id,
    recording_title,
    recording_url,
    duration_seconds,
    notes
  )
  SELECT
    um.deal_id,
    um.claap_id,
    um.title,
    um.recording_url,
    um.duration_seconds,
    'Auto-linked by one-time title rematch'
  FROM updated_meetings um
  ON CONFLICT (deal_id, recording_id) DO UPDATE
  SET
    recording_title = EXCLUDED.recording_title,
    recording_url = EXCLUDED.recording_url,
    duration_seconds = EXCLUDED.duration_seconds,
    notes = EXCLUDED.notes
  RETURNING deal_id
),
inserted_transcripts AS (
  INSERT INTO public.claap_transcripts (
    claap_meeting_id,
    deal_id,
    transcript_text,
    duration_seconds,
    recorded_at,
    call_type,
    match_source
  )
  SELECT
    um.id,
    um.deal_id,
    um.transcript,
    um.duration_seconds,
    um.started_at,
    um.call_type,
    'one_time_deal_title_rematch'
  FROM updated_meetings um
  WHERE um.transcript IS NOT NULL OR um.title IS NOT NULL
  ON CONFLICT (claap_meeting_id) DO UPDATE
  SET
    deal_id = EXCLUDED.deal_id,
    transcript_text = EXCLUDED.transcript_text,
    duration_seconds = EXCLUDED.duration_seconds,
    recorded_at = EXCLUDED.recorded_at,
    call_type = EXCLUDED.call_type,
    match_source = EXCLUDED.match_source
  RETURNING deal_id
)
INSERT INTO public.activity_logs (
  deal_id,
  activity_type,
  description,
  metadata,
  created_at
)
SELECT
  um.deal_id,
  'claap_recording_linked',
  'Claap recording linked (one-time rematch): ' || coalesce(um.title, 'Untitled'),
  jsonb_build_object(
    'claap_id', um.claap_id,
    'recording_url', um.recording_url,
    'source', 'one_time_deal_title_rematch',
    'call_type', um.call_type
  ),
  now()
FROM updated_meetings um
WHERE NOT EXISTS (
  SELECT 1
  FROM public.activity_logs al
  WHERE al.deal_id = um.deal_id
    AND al.activity_type = 'claap_recording_linked'
    AND coalesce(al.metadata ->> 'claap_id', '') = um.claap_id
);