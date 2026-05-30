
-- 1) Widen source CHECK to include orphan-link sources
ALTER TABLE public.claap_recording_links
  DROP CONSTRAINT IF EXISTS claap_recording_links_source_check;
ALTER TABLE public.claap_recording_links
  ADD CONSTRAINT claap_recording_links_source_check
  CHECK (source = ANY (ARRAY['auto'::text,'manual'::text,'eod'::text,'auto-repair'::text,'auto-orphan-link'::text]));

-- 2) Orphan linker: for every claap_recordings row with no primary_meeting link,
--    find or create a synthetic claap_meetings row and link it.
CREATE OR REPLACE FUNCTION public.claap_link_orphan_recordings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rec RECORD;
  v_meeting_id uuid;
  v_repaired integer := 0;
  v_meetings_created integer := 0;
BEGIN
  FOR v_rec IN
    SELECT cr.*
    FROM public.claap_recordings cr
    WHERE NOT EXISTS (
      SELECT 1 FROM public.claap_recording_links l
      WHERE l.recording_id = cr.id AND l.link_role = 'primary_meeting'
    )
    AND cr.external_id IS NOT NULL
  LOOP
    -- Try to find an existing meeting by claap_id matching the external_id.
    SELECT id INTO v_meeting_id
    FROM public.claap_meetings
    WHERE claap_id = v_rec.external_id
    LIMIT 1;

    -- Otherwise try by title + started_at proximity (±2h) scoped to same company if set.
    IF v_meeting_id IS NULL THEN
      SELECT id INTO v_meeting_id
      FROM public.claap_meetings cm
      WHERE lower(coalesce(cm.title,'')) = lower(coalesce(v_rec.title,''))
        AND v_rec.started_at IS NOT NULL
        AND cm.started_at IS NOT NULL
        AND abs(extract(epoch FROM (cm.started_at - v_rec.started_at))) <= 7200
        AND (v_rec.org_company_id IS NULL OR cm.company_id IS NULL OR cm.company_id = v_rec.org_company_id)
      ORDER BY abs(extract(epoch FROM (cm.started_at - v_rec.started_at))) ASC
      LIMIT 1;
    END IF;

    -- Otherwise create a synthetic meeting row.
    IF v_meeting_id IS NULL THEN
      BEGIN
        INSERT INTO public.claap_meetings (
          claap_id, title, started_at, organizer_email, company_id, status
        )
        VALUES (
          v_rec.external_id,
          coalesce(v_rec.title, 'Untitled Claap recording'),
          v_rec.started_at,
          v_rec.organizer_email,
          v_rec.org_company_id,
          'pending_review'
        )
        RETURNING id INTO v_meeting_id;
        v_meetings_created := v_meetings_created + 1;
      EXCEPTION WHEN unique_violation THEN
        SELECT id INTO v_meeting_id
        FROM public.claap_meetings
        WHERE claap_id = v_rec.external_id
        LIMIT 1;
      END;
    END IF;

    -- Insert link if not present.
    IF v_meeting_id IS NOT NULL THEN
      INSERT INTO public.claap_recording_links (
        recording_id, entity_type, entity_id, link_role, confidence, source
      )
      VALUES (
        v_rec.id, 'meeting', v_meeting_id, 'primary_meeting', 1.0, 'auto-orphan-link'
      )
      ON CONFLICT (recording_id, link_role, entity_id) DO NOTHING;
      v_repaired := v_repaired + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'orphans_repaired', v_repaired,
    'meetings_created', v_meetings_created
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.claap_link_orphan_recordings() TO authenticated, service_role;

-- 3) Replace get_event_claap_prefill_context with a version that accepts
--    optional event metadata as fallback when the calendar event is not stored.
DROP FUNCTION IF EXISTS public.get_event_claap_prefill_context(text);
DROP FUNCTION IF EXISTS public.get_event_claap_prefill_context(text, text, timestamptz, text);

CREATE OR REPLACE FUNCTION public.get_event_claap_prefill_context(
  p_event_id text,
  p_event_title text DEFAULT NULL,
  p_event_start timestamptz DEFAULT NULL,
  p_organizer_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_event public.calendar_events;
  v_company_ids uuid[];
  v_direct_event_link public.event_claap_recordings;
  v_meeting public.claap_meetings;
  v_link public.claap_recording_links;
  v_recording public.claap_recordings;
  v_note public.meeting_synthesized_notes;
  v_has_real boolean := false;
  v_has_synth boolean := false;
  v_effective_title text;
  v_effective_start timestamptz;
  v_effective_organizer text;
  v_fallback_used boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT array_agg(company_id) INTO v_company_ids
  FROM public.company_members WHERE user_id = v_user_id;

  IF coalesce(array_length(v_company_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_event
  FROM public.calendar_events
  WHERE event_id = p_event_id
  LIMIT 1;

  v_effective_title     := coalesce(v_event.title, p_event_title);
  v_effective_start     := coalesce(v_event.start_time, p_event_start);
  v_effective_organizer := coalesce(v_event.organizer_email, p_organizer_email);

  -- Try direct event link first (matches Google event_id).
  SELECT * INTO v_direct_event_link
  FROM public.event_claap_recordings
  WHERE event_id = p_event_id
    AND org_company_id = ANY(v_company_ids)
  ORDER BY linked_at DESC
  LIMIT 1;

  IF FOUND THEN
    SELECT * INTO v_recording
    FROM public.claap_recordings
    WHERE org_company_id = v_direct_event_link.org_company_id
      AND external_id = v_direct_event_link.recording_id
    LIMIT 1;
  END IF;

  -- Find a meeting that matches the event by id-equivalence or time/title proximity.
  SELECT * INTO v_meeting
  FROM public.claap_meetings cm
  WHERE cm.company_id = ANY(v_company_ids)
    AND (
      (cm.recording_url IS NOT NULL AND v_direct_event_link.recording_url IS NOT NULL AND cm.recording_url = v_direct_event_link.recording_url)
      OR (cm.claap_id IS NOT NULL AND v_direct_event_link.recording_id IS NOT NULL AND cm.claap_id = v_direct_event_link.recording_id)
      OR (
        v_effective_start IS NOT NULL
        AND cm.started_at IS NOT NULL
        AND abs(extract(epoch from (cm.started_at - v_effective_start))) <= 21600
        AND (
          coalesce(nullif(lower(cm.organizer_email), ''), '__none__')
            = coalesce(nullif(lower(v_effective_organizer), ''), '__none__')
          OR lower(coalesce(cm.title, '')) = lower(coalesce(v_effective_title, ''))
        )
      )
    )
  ORDER BY
    CASE WHEN cm.claap_id IS NOT NULL AND v_direct_event_link.recording_id IS NOT NULL AND cm.claap_id = v_direct_event_link.recording_id THEN 0 ELSE 1 END,
    abs(extract(epoch from (coalesce(cm.started_at, v_effective_start) - v_effective_start))) ASC,
    cm.updated_at DESC
  LIMIT 1;

  IF v_meeting.id IS NOT NULL THEN
    SELECT * INTO v_link
    FROM public.claap_recording_links
    WHERE entity_type = 'meeting' AND entity_id = v_meeting.id AND link_role = 'primary_meeting'
    ORDER BY confidence DESC NULLS LAST, created_at DESC LIMIT 1;

    IF v_link.id IS NOT NULL THEN
      SELECT * INTO v_recording FROM public.claap_recordings WHERE id = v_link.recording_id LIMIT 1;
    ELSIF v_recording.id IS NULL AND coalesce(v_meeting.claap_id, '') <> '' THEN
      SELECT * INTO v_recording FROM public.claap_recordings
      WHERE org_company_id = ANY(v_company_ids) AND external_id = v_meeting.claap_id
      ORDER BY claap_summary_synced_at DESC NULLS LAST, updated_at DESC LIMIT 1;
    END IF;

    SELECT * INTO v_note FROM public.meeting_synthesized_notes WHERE meeting_id = v_meeting.id;
  END IF;

  -- FALLBACK: still no recording. Match claap_recordings directly by title+time.
  IF v_recording.id IS NULL AND v_effective_title IS NOT NULL AND v_effective_start IS NOT NULL THEN
    SELECT * INTO v_recording
    FROM public.claap_recordings cr
    WHERE (cr.org_company_id IS NULL OR cr.org_company_id = ANY(v_company_ids))
      AND cr.started_at IS NOT NULL
      AND abs(extract(epoch from (cr.started_at - v_effective_start))) <= 21600
      AND (
        lower(btrim(coalesce(cr.title,''))) = lower(btrim(v_effective_title))
        OR lower(btrim(coalesce(cr.title,''))) LIKE lower(btrim(v_effective_title)) || '%'
        OR lower(btrim(v_effective_title)) LIKE lower(btrim(coalesce(cr.title,''))) || '%'
      )
    ORDER BY abs(extract(epoch from (cr.started_at - v_effective_start))) ASC,
             length(coalesce(cr.summary,'')) DESC
    LIMIT 1;

    IF v_recording.id IS NOT NULL THEN
      v_fallback_used := true;
      -- Best-effort: ensure a meeting+link exists so future reads are fast.
      IF v_meeting.id IS NULL AND coalesce(v_recording.external_id,'') <> '' THEN
        SELECT * INTO v_meeting FROM public.claap_meetings WHERE claap_id = v_recording.external_id LIMIT 1;
        IF v_meeting.id IS NULL THEN
          BEGIN
            INSERT INTO public.claap_meetings (claap_id, title, started_at, organizer_email, company_id, status)
            VALUES (v_recording.external_id, v_recording.title, v_recording.started_at, v_recording.organizer_email, v_recording.org_company_id, 'pending_review')
            RETURNING * INTO v_meeting;
          EXCEPTION WHEN unique_violation THEN
            SELECT * INTO v_meeting FROM public.claap_meetings WHERE claap_id = v_recording.external_id LIMIT 1;
          END;
        END IF;
        IF v_meeting.id IS NOT NULL THEN
          INSERT INTO public.claap_recording_links (recording_id, entity_type, entity_id, link_role, confidence, source)
          VALUES (v_recording.id, 'meeting', v_meeting.id, 'primary_meeting', 0.9, 'auto-repair')
          ON CONFLICT (recording_id, link_role, entity_id) DO NOTHING;
        END IF;
      END IF;
    END IF;
  END IF;

  v_has_real := v_recording.id IS NOT NULL AND (
    nullif(btrim(coalesce(v_recording.summary, '')), '') IS NOT NULL
    OR coalesce(jsonb_array_length(coalesce(v_recording.action_items, '[]'::jsonb)), 0) > 0
    OR coalesce(jsonb_array_length(coalesce(v_recording.key_takeaways, '[]'::jsonb)), 0) > 0
  );

  v_has_synth := v_note.meeting_id IS NOT NULL AND (
    nullif(btrim(coalesce(v_note.content->>'summary_md', '')), '') IS NOT NULL
    OR coalesce(jsonb_array_length(coalesce(v_note.content->'action_items', '[]'::jsonb)), 0) > 0
    OR coalesce(jsonb_array_length(coalesce(v_note.content->'key_takeaways', '[]'::jsonb)), 0) > 0
  );

  RETURN jsonb_build_object(
    'event_id', p_event_id,
    'event_title', v_effective_title,
    'meeting_id', v_meeting.id,
    'meeting_title', v_meeting.title,
    'recording', CASE WHEN v_recording.id IS NULL THEN null ELSE jsonb_build_object(
      'id', v_recording.external_id,
      'row_id', v_recording.id,
      'meetingRowId', v_meeting.id,
      'title', coalesce(v_recording.title, v_direct_event_link.recording_title),
      'url', coalesce(v_recording.recording_url, v_direct_event_link.recording_url, v_meeting.recording_url),
      'linkedNote', v_direct_event_link.notes
    ) END,
    'summary', CASE
      WHEN v_has_real THEN coalesce(nullif(btrim(coalesce(v_recording.summary, '')), ''), v_meeting.ai_summary)
      WHEN v_has_synth THEN coalesce(nullif(btrim(coalesce(v_note.content->>'summary_md', '')), ''), v_meeting.ai_summary)
      ELSE null
    END,
    'actionItems', CASE
      WHEN v_has_real THEN coalesce(v_recording.action_items, '[]'::jsonb)
      WHEN v_has_synth THEN coalesce(v_note.content->'action_items', '[]'::jsonb)
      ELSE coalesce(to_jsonb(v_meeting.next_steps), '[]'::jsonb)
    END,
    'keyTakeaways', CASE
      WHEN v_has_real THEN coalesce(v_recording.key_takeaways, '[]'::jsonb)
      WHEN v_has_synth THEN coalesce(v_note.content->'key_takeaways', '[]'::jsonb)
      ELSE coalesce(to_jsonb(v_meeting.key_decisions), '[]'::jsonb)
    END,
    'source', CASE WHEN v_has_real THEN 'claap' WHEN v_has_synth THEN 'synthesized' ELSE 'none' END,
    'has_real_summary', v_has_real,
    'transcriptAvailable', coalesce(v_recording.transcript_available, false) OR nullif(btrim(coalesce(v_meeting.transcript, '')), '') IS NOT NULL,
    'recording_url', coalesce(v_recording.recording_url, v_direct_event_link.recording_url, v_meeting.recording_url),
    'debug', jsonb_build_object(
      'query_sql', 'calendar_events(event_id) -> claap_meetings(time/title fallback) -> claap_recording_links(meeting) -> claap_recordings; final fallback: claap_recordings by title+started_at proximity using passed event title/start',
      'event_link_recording_id', v_direct_event_link.recording_id,
      'meeting_match_id', v_meeting.id,
      'link_id', v_link.id,
      'recording_row_id', v_recording.id,
      'recording_external_id', v_recording.external_id,
      'has_real', v_has_real,
      'has_synth', v_has_synth,
      'fallback_used', v_fallback_used,
      'effective_title', v_effective_title,
      'effective_start', v_effective_start
    )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_event_claap_prefill_context(text, text, timestamptz, text) TO authenticated, service_role;
