CREATE OR REPLACE FUNCTION public.debug_claap_prefill_source(p_meeting_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting public.claap_meetings;
  v_link public.claap_recording_links;
  v_recording public.claap_recordings;
  v_summary text;
  v_action_items_count integer := 0;
  v_key_takeaways_count integer := 0;
  v_source text := 'none';
BEGIN
  SELECT * INTO v_meeting
  FROM public.claap_meetings
  WHERE id = p_meeting_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'meeting_id', p_meeting_id,
      'recording_id', null,
      'has_summary', false,
      'summary_length', 0,
      'action_items_count', 0,
      'key_takeaways_count', 0,
      'source_chosen', 'none',
      'reason', 'meeting_not_found'
    );
  END IF;

  SELECT * INTO v_link
  FROM public.claap_recording_links
  WHERE entity_type = 'meeting'
    AND entity_id = p_meeting_id
    AND link_role = 'primary_meeting'
  ORDER BY confidence DESC NULLS LAST, created_at DESC
  LIMIT 1;

  IF FOUND THEN
    SELECT * INTO v_recording
    FROM public.claap_recordings
    WHERE id = v_link.recording_id;
  END IF;

  IF NOT FOUND AND coalesce(v_meeting.claap_id, '') <> '' THEN
    SELECT * INTO v_recording
    FROM public.claap_recordings
    WHERE external_id = v_meeting.claap_id
    ORDER BY claap_summary_synced_at DESC NULLS LAST, updated_at DESC
    LIMIT 1;
  END IF;

  v_summary := nullif(btrim(coalesce(v_recording.summary, '')), '');
  v_action_items_count := coalesce(jsonb_array_length(coalesce(v_recording.action_items, '[]'::jsonb)), 0);
  v_key_takeaways_count := coalesce(jsonb_array_length(coalesce(v_recording.key_takeaways, '[]'::jsonb)), 0);

  IF v_summary IS NOT NULL OR v_action_items_count > 0 OR v_key_takeaways_count > 0 THEN
    v_source := 'claap';
  ELSIF EXISTS (
    SELECT 1
    FROM public.meeting_synthesized_notes msn
    WHERE msn.meeting_id = p_meeting_id
      AND (
        nullif(btrim(coalesce(msn.content->>'summary_md', '')), '') IS NOT NULL
        OR coalesce(jsonb_array_length(coalesce(msn.content->'action_items', '[]'::jsonb)), 0) > 0
        OR coalesce(jsonb_array_length(coalesce(msn.content->'key_takeaways', '[]'::jsonb)), 0) > 0
      )
  ) THEN
    v_source := 'synthesized';
  END IF;

  RETURN jsonb_build_object(
    'meeting_id', p_meeting_id,
    'meeting_title', v_meeting.title,
    'recording_id', v_recording.id,
    'recording_external_id', v_recording.external_id,
    'recording_title', v_recording.title,
    'has_summary', v_summary IS NOT NULL,
    'summary_length', coalesce(length(v_summary), 0),
    'action_items_count', v_action_items_count,
    'key_takeaways_count', v_key_takeaways_count,
    'source_chosen', v_source,
    'link_id', v_link.id,
    'link_role', v_link.link_role
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_claap_prefill_source(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.debug_claap_prefill_source(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_event_claap_prefill_context(p_event_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT array_agg(company_id)
    INTO v_company_ids
  FROM public.company_members
  WHERE user_id = v_user_id;

  IF coalesce(array_length(v_company_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_event
  FROM public.calendar_events
  WHERE event_id = p_event_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('event_id', p_event_id, 'source', 'none', 'reason', 'event_not_found');
  END IF;

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

  SELECT * INTO v_meeting
  FROM public.claap_meetings cm
  WHERE cm.company_id = ANY(v_company_ids)
    AND (
      (cm.recording_url IS NOT NULL AND v_direct_event_link.recording_url IS NOT NULL AND cm.recording_url = v_direct_event_link.recording_url)
      OR (cm.claap_id IS NOT NULL AND v_direct_event_link.recording_id IS NOT NULL AND cm.claap_id = v_direct_event_link.recording_id)
      OR (
        v_event.start_time IS NOT NULL
        AND cm.started_at IS NOT NULL
        AND abs(extract(epoch from (cm.started_at - v_event.start_time))) <= 21600
        AND (
          coalesce(nullif(lower(cm.organizer_email), ''), '__none__') = coalesce(nullif(lower(v_event.organizer_email), ''), '__none__')
          OR lower(coalesce(cm.title, '')) = lower(coalesce(v_event.title, ''))
        )
      )
    )
  ORDER BY
    CASE WHEN cm.claap_id IS NOT NULL AND v_direct_event_link.recording_id IS NOT NULL AND cm.claap_id = v_direct_event_link.recording_id THEN 0 ELSE 1 END,
    CASE WHEN cm.recording_url IS NOT NULL AND v_direct_event_link.recording_url IS NOT NULL AND cm.recording_url = v_direct_event_link.recording_url THEN 0 ELSE 1 END,
    abs(extract(epoch from (coalesce(cm.started_at, v_event.start_time) - v_event.start_time))) ASC,
    cm.updated_at DESC
  LIMIT 1;

  IF v_meeting.id IS NOT NULL THEN
    SELECT * INTO v_link
    FROM public.claap_recording_links
    WHERE entity_type = 'meeting'
      AND entity_id = v_meeting.id
      AND link_role = 'primary_meeting'
    ORDER BY confidence DESC NULLS LAST, created_at DESC
    LIMIT 1;

    IF v_link.id IS NOT NULL THEN
      SELECT * INTO v_recording
      FROM public.claap_recordings
      WHERE id = v_link.recording_id
      LIMIT 1;
    ELSIF v_recording.id IS NULL AND coalesce(v_meeting.claap_id, '') <> '' THEN
      SELECT * INTO v_recording
      FROM public.claap_recordings
      WHERE org_company_id = ANY(v_company_ids)
        AND external_id = v_meeting.claap_id
      ORDER BY claap_summary_synced_at DESC NULLS LAST, updated_at DESC
      LIMIT 1;
    END IF;

    SELECT * INTO v_note
    FROM public.meeting_synthesized_notes
    WHERE meeting_id = v_meeting.id;
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
    'event_title', v_event.title,
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
    'transcriptAvailable', coalesce(v_recording.transcript_available, false) OR nullif(btrim(coalesce(v_meeting.transcript, '')), '') IS NOT NULL,
    'recording_url', coalesce(v_recording.recording_url, v_direct_event_link.recording_url, v_meeting.recording_url),
    'debug', jsonb_build_object(
      'query_sql', 'calendar_events(event_id) -> claap_meetings(company_id + title/organizer/start fallback) -> claap_recording_links(entity_type=''meeting'', link_role=''primary_meeting'') -> claap_recordings(summary, action_items, key_takeaways, recording_url); fallback: event_claap_recordings -> claap_recordings(external_id)',
      'event_link_recording_id', v_direct_event_link.recording_id,
      'meeting_match_id', v_meeting.id,
      'link_id', v_link.id,
      'recording_row_id', v_recording.id,
      'recording_external_id', v_recording.external_id,
      'has_real', v_has_real,
      'has_synth', v_has_synth
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_event_claap_prefill_context(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_claap_prefill_context(text) TO service_role;