ALTER TABLE public.claap_transcripts ADD COLUMN IF NOT EXISTS action_items jsonb;

CREATE OR REPLACE FUNCTION public.claap_upsert_transcript_for_deal(p_meeting_id uuid, p_deal_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_transcript text;
  v_summary    text;
  v_duration   integer;
  v_started    timestamptz;
  v_parts      jsonb;
  v_claap_id   text;
  v_rec_summary text;
  v_rec_actions jsonb;
  v_rec_parts   jsonb;
  v_rec_started timestamptz;
  v_rec_duration integer;
BEGIN
  SELECT NULLIF(m.transcript, ''), NULLIF(m.ai_summary, ''), m.duration_seconds, m.started_at, m.claap_id
    INTO v_transcript, v_summary, v_duration, v_started, v_claap_id
  FROM public.claap_meetings m
  WHERE m.id = p_meeting_id;

  -- Fallback to the recording mirror for summary / action items / metadata
  IF v_claap_id IS NOT NULL THEN
    SELECT NULLIF(r.summary, ''), r.action_items, r.participants, r.started_at,
           CASE WHEN r.ended_at IS NOT NULL AND r.started_at IS NOT NULL
                THEN GREATEST(0, EXTRACT(EPOCH FROM (r.ended_at - r.started_at))::int)
                ELSE NULL END
      INTO v_rec_summary, v_rec_actions, v_rec_parts, v_rec_started, v_rec_duration
    FROM public.claap_recordings r
    WHERE r.external_id = v_claap_id
    LIMIT 1;
  END IF;

  v_summary  := COALESCE(v_summary, v_rec_summary);
  v_duration := COALESCE(v_duration, v_rec_duration);
  v_started  := COALESCE(v_started, v_rec_started);

  IF v_transcript IS NULL AND v_summary IS NULL AND v_rec_actions IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', p.name, 'email', p.email, 'internal', p.is_internal)), '[]'::jsonb)
    INTO v_parts
  FROM public.claap_meeting_participants p
  WHERE p.meeting_id = p_meeting_id;

  IF v_parts IS NULL OR v_parts = '[]'::jsonb THEN
    v_parts := COALESCE(v_rec_parts, '[]'::jsonb);
  END IF;

  INSERT INTO public.claap_transcripts (
    deal_id, claap_meeting_id, transcript_text, summary, action_items,
    participants, duration_seconds, recorded_at, match_source
  )
  VALUES (p_deal_id, p_meeting_id, v_transcript, v_summary, v_rec_actions, v_parts, v_duration, v_started, 'auto_link')
  ON CONFLICT (claap_meeting_id) DO UPDATE
  SET deal_id         = EXCLUDED.deal_id,
      transcript_text = COALESCE(NULLIF(EXCLUDED.transcript_text, ''), public.claap_transcripts.transcript_text),
      summary         = COALESCE(NULLIF(EXCLUDED.summary, ''),         public.claap_transcripts.summary),
      action_items    = COALESCE(EXCLUDED.action_items,                public.claap_transcripts.action_items),
      participants    = CASE WHEN EXCLUDED.participants = '[]'::jsonb THEN public.claap_transcripts.participants ELSE EXCLUDED.participants END,
      duration_seconds= COALESCE(EXCLUDED.duration_seconds, public.claap_transcripts.duration_seconds),
      recorded_at     = COALESCE(EXCLUDED.recorded_at,     public.claap_transcripts.recorded_at);
END;
$function$;