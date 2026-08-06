
CREATE OR REPLACE FUNCTION public.claap_link_recording_contacts(p_recording_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  WITH recs AS (
    SELECT r.id, r.org_company_id
    FROM claap_recordings r
    WHERE p_recording_id IS NULL OR r.id = p_recording_id
  ),
  emails AS (
    -- emails on the recording's own participant payload
    SELECT recs.id AS recording_id, recs.org_company_id,
           lower(trim(p->>'email')) AS email
    FROM recs
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE((SELECT participants FROM claap_recordings cr WHERE cr.id = recs.id), '[]'::jsonb)
    ) AS p
    WHERE COALESCE(p->>'email','') <> ''
    UNION
    -- emails on the guest list of any meeting this recording is attached to
    SELECT recs.id, recs.org_company_id, lower(trim(mp.email))
    FROM recs
    JOIN claap_recording_links l
      ON l.recording_id = recs.id AND l.entity_type = 'meeting'
    JOIN claap_meeting_participants mp
      ON mp.meeting_id = l.entity_id
    WHERE COALESCE(mp.email,'') <> ''
  ),
  matched AS (
    SELECT DISTINCT e.recording_id, c.id AS contact_id
    FROM emails e
    JOIN contacts c
      ON lower(c.email) = e.email
     AND (c.company_id = e.org_company_id OR c.org_company_id = e.org_company_id)
  ),
  ins AS (
    INSERT INTO claap_recording_links (recording_id, entity_type, entity_id, link_role, source, confidence)
    SELECT m.recording_id, 'contact', m.contact_id, 'attendee_contact', 'auto', 1.0
    FROM matched m
    ON CONFLICT (recording_id, link_role, entity_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM ins;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_claap_link_recording_contacts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'claap_recordings' THEN
    PERFORM public.claap_link_recording_contacts(NEW.id);
  ELSIF TG_TABLE_NAME = 'claap_recording_links' THEN
    IF NEW.entity_type = 'meeting' THEN
      PERFORM public.claap_link_recording_contacts(NEW.recording_id);
    END IF;
  ELSIF TG_TABLE_NAME = 'claap_meeting_participants' THEN
    PERFORM public.claap_link_recording_contacts(l.recording_id)
    FROM claap_recording_links l
    WHERE l.entity_type = 'meeting' AND l.entity_id = NEW.meeting_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS claap_recordings_link_contacts ON public.claap_recordings;
CREATE TRIGGER claap_recordings_link_contacts
AFTER INSERT OR UPDATE OF participants ON public.claap_recordings
FOR EACH ROW EXECUTE FUNCTION public.trg_claap_link_recording_contacts();

DROP TRIGGER IF EXISTS claap_links_link_contacts ON public.claap_recording_links;
CREATE TRIGGER claap_links_link_contacts
AFTER INSERT ON public.claap_recording_links
FOR EACH ROW WHEN (NEW.entity_type = 'meeting')
EXECUTE FUNCTION public.trg_claap_link_recording_contacts();

DROP TRIGGER IF EXISTS claap_participants_link_contacts ON public.claap_meeting_participants;
CREATE TRIGGER claap_participants_link_contacts
AFTER INSERT ON public.claap_meeting_participants
FOR EACH ROW EXECUTE FUNCTION public.trg_claap_link_recording_contacts();

SELECT public.claap_link_recording_contacts(NULL);
