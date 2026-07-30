CREATE OR REPLACE FUNCTION public.backfill_claap_recordings_from_meetings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_inserted_recordings integer := 0;
  v_inserted_links integer := 0;
  v_hydrated_participants integer := 0;
BEGIN
  WITH ins AS (
    INSERT INTO public.claap_recordings (
      org_company_id, external_id, title, started_at, organizer_email, status, participants
    )
    SELECT DISTINCT ON (cm.company_id, cm.claap_id)
      cm.company_id, cm.claap_id, cm.title, cm.started_at, cm.organizer_email, 'new',
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', COALESCE(p.email, p.name),
                 'name', COALESCE(p.name, ''),
                 'email', COALESCE(p.email, ''),
                 'attended', true
               ) ORDER BY p.name NULLS LAST)
        FROM public.claap_meeting_participants p
        WHERE p.meeting_id = cm.id
      ), '[]'::jsonb)
    FROM public.claap_meetings cm
    WHERE cm.claap_id IS NOT NULL
      AND cm.company_id IS NOT NULL
      AND cm.claap_id NOT LIKE 'test-%'
      AND NOT EXISTS (
        SELECT 1 FROM public.claap_recordings cr
        WHERE cr.org_company_id = cm.company_id
          AND cr.external_id = cm.claap_id
      )
    ORDER BY cm.company_id, cm.claap_id, cm.started_at DESC
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted_recordings FROM ins;

  WITH ins AS (
    INSERT INTO public.claap_recording_links (
      entity_type, entity_id, recording_id, link_role, confidence
    )
    SELECT 'meeting', cm.id, cr.id, 'primary_meeting', 1.0
    FROM public.claap_meetings cm
    JOIN public.claap_recordings cr
      ON cr.org_company_id = cm.company_id
     AND cr.external_id = cm.claap_id
    WHERE cm.claap_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.claap_recording_links l
        WHERE l.entity_type = 'meeting'
          AND l.entity_id = cm.id
          AND l.recording_id = cr.id
          AND l.link_role = 'primary_meeting'
      )
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted_links FROM ins;

  -- Keep existing rows searchable by attendee: fill in any empty lists from
  -- the stored meeting participants.
  WITH upd AS (
    UPDATE public.claap_recordings r
    SET participants = agg.participants,
        updated_at = now()
    FROM (
      SELECT m.claap_id, m.company_id,
             jsonb_agg(jsonb_build_object(
               'id', COALESCE(p.email, p.name),
               'name', COALESCE(p.name, ''),
               'email', COALESCE(p.email, ''),
               'attended', true
             ) ORDER BY p.name NULLS LAST) AS participants
      FROM public.claap_meetings m
      JOIN public.claap_meeting_participants p ON p.meeting_id = m.id
      WHERE m.claap_id IS NOT NULL
      GROUP BY m.claap_id, m.company_id
    ) agg
    WHERE r.external_id = agg.claap_id
      AND (r.participants IS NULL OR r.participants::text IN ('[]', 'null'))
    RETURNING 1
  )
  SELECT count(*) INTO v_hydrated_participants FROM upd;

  RETURN jsonb_build_object(
    'inserted_recordings', v_inserted_recordings,
    'inserted_links', v_inserted_links,
    'hydrated_participants', v_hydrated_participants
  );
END;
$function$;