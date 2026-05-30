CREATE TABLE IF NOT EXISTS public.meeting_synthesized_notes (
  meeting_id uuid PRIMARY KEY,
  org_company_id uuid NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text,
  source text NOT NULL DEFAULT 'synthesized',
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_synthesized_notes TO authenticated;
GRANT ALL ON public.meeting_synthesized_notes TO service_role;

ALTER TABLE public.meeting_synthesized_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meeting_synthesized_notes_company_access" ON public.meeting_synthesized_notes;
CREATE POLICY "meeting_synthesized_notes_company_access"
ON public.meeting_synthesized_notes
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.company_id = meeting_synthesized_notes.org_company_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.company_id = meeting_synthesized_notes.org_company_id
  )
);

CREATE INDEX IF NOT EXISTS idx_meeting_synthesized_notes_org_company_id
  ON public.meeting_synthesized_notes(org_company_id);

DROP TRIGGER IF EXISTS update_meeting_synthesized_notes_updated_at ON public.meeting_synthesized_notes;
CREATE TRIGGER update_meeting_synthesized_notes_updated_at
BEFORE UPDATE ON public.meeting_synthesized_notes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.get_or_create_synthesized_note(p_meeting_id uuid)
RETURNS public.meeting_synthesized_notes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_note public.meeting_synthesized_notes;
  v_meeting public.claap_meetings;
  v_company_id uuid;
  v_service_key text := current_setting('app.settings.service_role_key', true);
  v_project_url text := 'https://tgkksvazruzbghssnxde.supabase.co';
BEGIN
  SELECT * INTO v_meeting
  FROM public.claap_meetings
  WHERE id = p_meeting_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'meeting not found';
  END IF;

  v_company_id := v_meeting.company_id;

  IF v_company_id IS NULL THEN
    SELECT ecr.org_company_id
      INTO v_company_id
    FROM public.event_claap_recordings ecr
    WHERE ecr.recording_id = v_meeting.claap_id
    ORDER BY ecr.linked_at DESC
    LIMIT 1;
  END IF;

  IF v_company_id IS NULL THEN
    SELECT cm.company_id
      INTO v_company_id
    FROM public.company_members cm
    WHERE cm.user_id = auth.uid()
    ORDER BY cm.company_id
    LIMIT 1;
  END IF;

  SELECT * INTO v_note
  FROM public.meeting_synthesized_notes
  WHERE meeting_id = p_meeting_id;

  IF FOUND AND v_note.updated_at > now() - interval '24 hours' THEN
    RETURN v_note;
  END IF;

  IF COALESCE(v_service_key, '') <> '' THEN
    PERFORM net.http_post(
      url := v_project_url || '/functions/v1/synthesize-meeting-note',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object(
        'meeting_id', p_meeting_id,
        'org_company_id', v_company_id,
        'trigger', 'rpc'
      )
    );
  END IF;

  SELECT * INTO v_note
  FROM public.meeting_synthesized_notes
  WHERE meeting_id = p_meeting_id;

  IF FOUND THEN
    RETURN v_note;
  END IF;

  INSERT INTO public.meeting_synthesized_notes (meeting_id, org_company_id, content, model, source, created_by)
  VALUES (
    p_meeting_id,
    COALESCE(v_company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    jsonb_build_object('summary_md', '', 'action_items', '[]'::jsonb, 'key_takeaways', '[]'::jsonb),
    NULL,
    'synthesized',
    auth.uid()
  )
  ON CONFLICT (meeting_id) DO NOTHING;

  SELECT * INTO v_note
  FROM public.meeting_synthesized_notes
  WHERE meeting_id = p_meeting_id;

  RETURN v_note;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_synthesized_note(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_synthesized_note(uuid) TO service_role;

DROP FUNCTION IF EXISTS public.claap_assert_prefill_examples();
CREATE FUNCTION public.claap_assert_prefill_examples()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched_count integer;
BEGIN
  SELECT count(*)
  INTO matched_count
  FROM public.claap_meetings cm
  JOIN public.meeting_synthesized_notes msn ON msn.meeting_id = cm.id
  WHERE (
    cm.title ILIKE '%Datarails%'
    OR cm.title ILIKE '%Shimmy Ruben%'
    OR cm.title ILIKE '%Blount Consulting%'
  )
  AND (
    NULLIF(btrim(COALESCE(msn.content->>'summary_md', '')), '') IS NOT NULL
    OR COALESCE(jsonb_array_length(COALESCE(msn.content->'action_items', '[]'::jsonb)), 0) > 0
    OR COALESCE(jsonb_array_length(COALESCE(msn.content->'key_takeaways', '[]'::jsonb)), 0) > 0
  );

  IF matched_count < 3 THEN
    RAISE EXCEPTION 'claap_assert_prefill_examples failed: expected synthesized note content for Datarails, Shimmy Ruben, and Blount Consulting';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claap_assert_prefill_examples() TO authenticated;
GRANT EXECUTE ON FUNCTION public.claap_assert_prefill_examples() TO service_role;