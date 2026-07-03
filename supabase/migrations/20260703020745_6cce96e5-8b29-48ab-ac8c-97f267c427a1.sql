
CREATE TABLE public.user_meeting_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  event_title text,
  event_start timestamptz,
  event_end timestamptz,
  organizer_email text,
  attendee_emails text[] DEFAULT '{}'::text[],
  attendee_names text[] DEFAULT '{}'::text[],
  linked_deal_id uuid,
  note_text text NOT NULL,
  search_tsv tsvector,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_meeting_notes TO authenticated;
GRANT ALL ON public.user_meeting_notes TO service_role;

ALTER TABLE public.user_meeting_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own meeting notes"
  ON public.user_meeting_notes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX user_meeting_notes_user_event_idx
  ON public.user_meeting_notes (user_id, event_id, created_at DESC);
CREATE INDEX user_meeting_notes_user_start_idx
  ON public.user_meeting_notes (user_id, event_start DESC);
CREATE INDEX user_meeting_notes_search_idx
  ON public.user_meeting_notes USING GIN (search_tsv);
CREATE INDEX user_meeting_notes_attendee_emails_idx
  ON public.user_meeting_notes USING GIN (attendee_emails);

CREATE OR REPLACE FUNCTION public.user_meeting_notes_set_search_tsv()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.search_tsv := to_tsvector('english',
    coalesce(NEW.note_text,'') || ' ' ||
    coalesce(NEW.event_title,'') || ' ' ||
    coalesce(array_to_string(NEW.attendee_names,' '),'') || ' ' ||
    coalesce(array_to_string(NEW.attendee_emails,' '),'') || ' ' ||
    coalesce(NEW.organizer_email,'')
  );
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_meeting_notes_search_tsv_biu
  BEFORE INSERT OR UPDATE ON public.user_meeting_notes
  FOR EACH ROW EXECUTE FUNCTION public.user_meeting_notes_set_search_tsv();
