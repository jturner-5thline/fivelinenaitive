
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS last_contact_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_contacts_company_last_contact_at
  ON public.contacts (company_id, last_contact_at DESC NULLS LAST);

CREATE OR REPLACE FUNCTION public.bump_contact_last_contact(_emails text[], _at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  lowered text[];
BEGIN
  IF _at IS NULL OR _emails IS NULL OR array_length(_emails, 1) IS NULL THEN RETURN; END IF;
  SELECT array_agg(DISTINCT lower(e)) INTO lowered
  FROM unnest(_emails) AS e WHERE e IS NOT NULL AND length(trim(e)) > 0;
  IF lowered IS NULL THEN RETURN; END IF;

  UPDATE public.contacts c
  SET last_contact_at = _at
  WHERE (c.last_contact_at IS NULL OR c.last_contact_at < _at)
    AND (
      lower(c.email) = ANY(lowered)
      OR EXISTS (
        SELECT 1 FROM unnest(COALESCE(c.additional_emails, ARRAY[]::text[])) AS ae
        WHERE lower(ae) = ANY(lowered)
      )
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.bump_contact_last_contact_by_id(_contact_id uuid, _at timestamptz)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.contacts
  SET last_contact_at = _at
  WHERE id = _contact_id AND (last_contact_at IS NULL OR last_contact_at < _at);
$$;

CREATE OR REPLACE FUNCTION public.trg_bump_contact_from_gmail_in()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.bump_contact_last_contact(
    ARRAY[NEW.from_email] || COALESCE(NEW.to_emails, ARRAY[]::text[]) || COALESCE(NEW.cc_emails, ARRAY[]::text[]),
    COALESCE(NEW.received_at, NEW.created_at));
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_bump_contact_from_gmail_sent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.bump_contact_last_contact(
    COALESCE(NEW.to_emails, ARRAY[]::text[]) || COALESCE(NEW.cc_emails, ARRAY[]::text[]),
    COALESCE(NEW.sent_at, NEW.created_at));
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_bump_contact_from_ms_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE recipients text[];
BEGIN
  SELECT array_agg(value->>'email') INTO recipients
  FROM jsonb_array_elements(COALESCE(NEW.to_recipients, '[]'::jsonb)) AS value
  WHERE value ? 'email';
  PERFORM public.bump_contact_last_contact(
    ARRAY[NEW.from_email] || COALESCE(recipients, ARRAY[]::text[]),
    COALESCE(NEW.received_at, NEW.created_at));
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_bump_contact_from_calendar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.bump_contact_last_contact(
    ARRAY[NEW.organizer_email] || COALESCE(NEW.attendees, ARRAY[]::text[]),
    COALESCE(NEW.start_time, NEW.created_at));
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_bump_contact_from_claap_participant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE mtg_started timestamptz;
BEGIN
  IF NEW.contact_id IS NULL THEN RETURN NEW; END IF;
  SELECT started_at INTO mtg_started FROM public.claap_meetings WHERE id = NEW.meeting_id;
  PERFORM public.bump_contact_last_contact_by_id(NEW.contact_id, COALESCE(mtg_started, NEW.created_at));
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_bump_contact_from_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.contact_id IS NULL THEN RETURN NEW; END IF;
  PERFORM public.bump_contact_last_contact_by_id(NEW.contact_id, COALESCE(NEW.occurred_at, NEW.created_at));
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS bump_contact_gmail_in ON public.gmail_messages;
CREATE TRIGGER bump_contact_gmail_in AFTER INSERT ON public.gmail_messages
  FOR EACH ROW EXECUTE FUNCTION public.trg_bump_contact_from_gmail_in();

DROP TRIGGER IF EXISTS bump_contact_gmail_sent ON public.gmail_sent_messages;
CREATE TRIGGER bump_contact_gmail_sent AFTER INSERT ON public.gmail_sent_messages
  FOR EACH ROW EXECUTE FUNCTION public.trg_bump_contact_from_gmail_sent();

DROP TRIGGER IF EXISTS bump_contact_ms_email ON public.ms_synced_emails;
CREATE TRIGGER bump_contact_ms_email AFTER INSERT ON public.ms_synced_emails
  FOR EACH ROW EXECUTE FUNCTION public.trg_bump_contact_from_ms_email();

DROP TRIGGER IF EXISTS bump_contact_calendar ON public.calendar_events;
CREATE TRIGGER bump_contact_calendar AFTER INSERT ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.trg_bump_contact_from_calendar();

DROP TRIGGER IF EXISTS bump_contact_claap_participant ON public.claap_meeting_participants;
CREATE TRIGGER bump_contact_claap_participant AFTER INSERT ON public.claap_meeting_participants
  FOR EACH ROW EXECUTE FUNCTION public.trg_bump_contact_from_claap_participant();

DROP TRIGGER IF EXISTS bump_contact_activity ON public.contact_activities;
CREATE TRIGGER bump_contact_activity AFTER INSERT ON public.contact_activities
  FOR EACH ROW EXECUTE FUNCTION public.trg_bump_contact_from_activity();

-- Backfill
WITH src AS (
  SELECT lower(from_email) AS email, COALESCE(received_at, created_at) AS at FROM public.gmail_messages
  UNION ALL SELECT lower(e), COALESCE(received_at, created_at) FROM public.gmail_messages, unnest(COALESCE(to_emails, ARRAY[]::text[])) AS e
  UNION ALL SELECT lower(e), COALESCE(received_at, created_at) FROM public.gmail_messages, unnest(COALESCE(cc_emails, ARRAY[]::text[])) AS e
  UNION ALL SELECT lower(e), COALESCE(sent_at, created_at) FROM public.gmail_sent_messages, unnest(COALESCE(to_emails, ARRAY[]::text[])) AS e
  UNION ALL SELECT lower(e), COALESCE(sent_at, created_at) FROM public.gmail_sent_messages, unnest(COALESCE(cc_emails, ARRAY[]::text[])) AS e
  UNION ALL SELECT lower(from_email), COALESCE(received_at, created_at) FROM public.ms_synced_emails
  UNION ALL SELECT lower(organizer_email), COALESCE(start_time, created_at) FROM public.calendar_events
  UNION ALL SELECT lower(e), COALESCE(start_time, created_at) FROM public.calendar_events, unnest(COALESCE(attendees, ARRAY[]::text[])) AS e
), agg AS (
  SELECT email, MAX(at) AS max_at FROM src WHERE email IS NOT NULL AND email <> '' GROUP BY email
)
UPDATE public.contacts c
SET last_contact_at = GREATEST(COALESCE(c.last_contact_at, 'epoch'::timestamptz), agg.max_at)
FROM agg
WHERE lower(c.email) = agg.email
  AND (c.last_contact_at IS NULL OR c.last_contact_at < agg.max_at);

WITH src AS (
  SELECT p.contact_id, MAX(COALESCE(m.started_at, p.created_at)) AS max_at
  FROM public.claap_meeting_participants p
  LEFT JOIN public.claap_meetings m ON m.id = p.meeting_id
  WHERE p.contact_id IS NOT NULL GROUP BY p.contact_id
)
UPDATE public.contacts c SET last_contact_at = GREATEST(COALESCE(c.last_contact_at, 'epoch'::timestamptz), src.max_at)
FROM src WHERE c.id = src.contact_id AND (c.last_contact_at IS NULL OR c.last_contact_at < src.max_at);

WITH src AS (
  SELECT contact_id, MAX(COALESCE(occurred_at, created_at)) AS max_at
  FROM public.contact_activities WHERE contact_id IS NOT NULL GROUP BY contact_id
)
UPDATE public.contacts c SET last_contact_at = GREATEST(COALESCE(c.last_contact_at, 'epoch'::timestamptz), src.max_at)
FROM src WHERE c.id = src.contact_id AND (c.last_contact_at IS NULL OR c.last_contact_at < src.max_at);
