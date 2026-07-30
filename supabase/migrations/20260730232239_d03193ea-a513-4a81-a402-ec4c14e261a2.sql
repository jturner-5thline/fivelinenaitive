CREATE OR REPLACE FUNCTION public.backfill_claap_recordings_from_meetings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_inserted_recordings integer := 0;
  v_inserted_links integer := 0;
BEGIN
  WITH ins AS (
    INSERT INTO public.claap_recordings (
      org_company_id, external_id, title, started_at, organizer_email, status
    )
    SELECT DISTINCT ON (cm.company_id, cm.claap_id)
      cm.company_id, cm.claap_id, cm.title, cm.started_at, cm.organizer_email, 'new'
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

  RETURN jsonb_build_object(
    'inserted_recordings', v_inserted_recordings,
    'inserted_links', v_inserted_links
  );
END;
$function$;