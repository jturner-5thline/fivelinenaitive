
-- Helper: upsert a claap_transcripts row for a given (meeting, deal) pair
CREATE OR REPLACE FUNCTION public.claap_upsert_transcript_for_deal(p_meeting_id uuid, p_deal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transcript text;
  v_summary    text;
  v_duration   integer;
  v_started    timestamptz;
  v_parts      jsonb;
BEGIN
  SELECT NULLIF(m.transcript, ''), NULLIF(m.ai_summary, ''), m.duration_seconds, m.started_at
    INTO v_transcript, v_summary, v_duration, v_started
  FROM public.claap_meetings m
  WHERE m.id = p_meeting_id;

  -- Nothing to digest yet
  IF v_transcript IS NULL AND v_summary IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', p.name, 'email', p.email, 'internal', p.is_internal)), '[]'::jsonb)
    INTO v_parts
  FROM public.claap_meeting_participants p
  WHERE p.meeting_id = p_meeting_id;

  INSERT INTO public.claap_transcripts (
    deal_id, claap_meeting_id, transcript_text, summary,
    participants, duration_seconds, recorded_at, match_source
  )
  VALUES (p_deal_id, p_meeting_id, v_transcript, v_summary, v_parts, v_duration, v_started, 'auto_link')
  ON CONFLICT (claap_meeting_id) DO UPDATE
  SET deal_id         = EXCLUDED.deal_id,
      transcript_text = COALESCE(NULLIF(EXCLUDED.transcript_text, ''), public.claap_transcripts.transcript_text),
      summary         = COALESCE(NULLIF(EXCLUDED.summary, ''),         public.claap_transcripts.summary),
      participants    = EXCLUDED.participants,
      duration_seconds= COALESCE(EXCLUDED.duration_seconds, public.claap_transcripts.duration_seconds),
      recorded_at     = COALESCE(EXCLUDED.recorded_at,     public.claap_transcripts.recorded_at);
END;
$$;

-- Trigger 1: when a Claap recording is linked to a deal, digest it
CREATE OR REPLACE FUNCTION public.trg_digest_deal_claap_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_meeting_id uuid;
BEGIN
  SELECT id INTO v_meeting_id FROM public.claap_meetings WHERE claap_id = NEW.recording_id LIMIT 1;
  IF v_meeting_id IS NOT NULL THEN
    PERFORM public.claap_upsert_transcript_for_deal(v_meeting_id, NEW.deal_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deal_claap_recording_digest ON public.deal_claap_recordings;
CREATE TRIGGER trg_deal_claap_recording_digest
AFTER INSERT ON public.deal_claap_recordings
FOR EACH ROW EXECUTE FUNCTION public.trg_digest_deal_claap_link();

-- Trigger 2: when a Claap meeting's transcript/summary changes, refresh all linked deals
CREATE OR REPLACE FUNCTION public.trg_digest_claap_meeting_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record;
BEGIN
  IF COALESCE(NEW.transcript, '') = COALESCE(OLD.transcript, '')
     AND COALESCE(NEW.ai_summary, '') = COALESCE(OLD.ai_summary, '') THEN
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT DISTINCT dcr.deal_id
    FROM public.deal_claap_recordings dcr
    WHERE dcr.recording_id = NEW.claap_id
  LOOP
    PERFORM public.claap_upsert_transcript_for_deal(NEW.id, r.deal_id);
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_claap_meeting_digest ON public.claap_meetings;
CREATE TRIGGER trg_claap_meeting_digest
AFTER UPDATE OF transcript, ai_summary ON public.claap_meetings
FOR EACH ROW EXECUTE FUNCTION public.trg_digest_claap_meeting_update();
