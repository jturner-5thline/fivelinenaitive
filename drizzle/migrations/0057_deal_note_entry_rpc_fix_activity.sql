CREATE OR REPLACE FUNCTION public.add_deal_note_entry(
  _deal_id uuid, _title text, _entry_html text, _mode text DEFAULT 'prepend',
  _create_if_missing boolean DEFAULT true, _idempotency_key text DEFAULT NULL, _source text DEFAULT 'Claude agent'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _deal record;
  _matches uuid[];
  _note public.deal_space_notes%ROWTYPE;
  _created boolean := false;
  _version uuid;
  _existing record;
  _new_content text;
  _key text := NULLIF(btrim(COALESCE(_idempotency_key, '')), '');
  _t text := btrim(COALESCE(NULLIF(btrim(_title), ''), 'Q&A Notes'));
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF _mode NOT IN ('prepend','append') THEN RAISE EXCEPTION 'mode must be prepend or append'; END IF;
  IF COALESCE(btrim(_entry_html), '') = '' THEN RAISE EXCEPTION 'entry cannot be empty'; END IF;

  SELECT id, user_id INTO _deal FROM public.deals WHERE id = _deal_id;
  IF NOT FOUND OR NOT (_deal.user_id = _uid OR public.is_same_company_as_user(_uid, _deal.user_id)) THEN
    RAISE EXCEPTION 'You do not have access to deal %', _deal_id USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('deal_note_entry:' || _deal_id::text));

  SELECT array_agg(id ORDER BY updated_at DESC) INTO _matches FROM public.deal_space_notes
   WHERE deal_id = _deal_id AND lower(btrim(title)) = lower(_t);

  IF COALESCE(array_length(_matches, 1), 0) > 1 THEN
    RETURN jsonb_build_object('status','ambiguous','candidates',
      (SELECT jsonb_agg(jsonb_build_object('note_id', id, 'title', title, 'updated_at', updated_at) ORDER BY updated_at DESC)
         FROM public.deal_space_notes WHERE id = ANY(_matches)));
  END IF;

  IF COALESCE(array_length(_matches, 1), 0) = 1 THEN
    SELECT * INTO _note FROM public.deal_space_notes WHERE id = _matches[1] FOR UPDATE;
    IF _key IS NOT NULL THEN
      SELECT * INTO _existing FROM public.deal_space_note_entry_keys WHERE note_id = _note.id AND idempotency_key = _key;
      IF FOUND THEN
        RETURN jsonb_build_object('status','ok','note_id',_note.id,'title',_note.title,'created',false,'deduplicated',true,'version_id',_existing.version_id);
      END IF;
    END IF;
    _new_content := CASE
      WHEN COALESCE(btrim(_note.content), '') = '' THEN _entry_html
      WHEN _mode = 'prepend' THEN _entry_html || '<hr>' || _note.content
      ELSE _note.content || '<hr>' || _entry_html END;
    UPDATE public.deal_space_notes SET content = _new_content, updated_at = now() WHERE id = _note.id;
    SELECT id INTO _version FROM public.deal_space_note_versions WHERE note_id = _note.id ORDER BY created_at DESC LIMIT 1;
  ELSE
    IF NOT _create_if_missing THEN
      RETURN jsonb_build_object('status','not_found','title',_t);
    END IF;
    INSERT INTO public.deal_space_notes (deal_id, user_id, title, content, is_shared)
      VALUES (_deal_id, _uid, _t, _entry_html, true) RETURNING * INTO _note;
    _created := true;
    INSERT INTO public.deal_space_note_versions (note_id, content, title, user_id)
      VALUES (_note.id, _entry_html, _t, _uid) RETURNING id INTO _version;
  END IF;

  IF _key IS NOT NULL THEN
    INSERT INTO public.deal_space_note_entry_keys (note_id, idempotency_key, version_id, user_id) VALUES (_note.id, _key, _version, _uid);
  END IF;

  INSERT INTO public.deal_activity (deal_id, user_id, source, action_type, before, after)
  VALUES (_deal_id, _uid, COALESCE(NULLIF(btrim(_source), ''), 'Claude agent'), 'deal_note_entry_added', '{}'::jsonb,
    jsonb_build_object('note_id', _note.id, 'title', _note.title, 'mode', _mode, 'created', _created, 'idempotency_key', _key));

  RETURN jsonb_build_object('status','ok','note_id',_note.id,'title',_note.title,'created',_created,'deduplicated',false,'version_id',_version);
END $$;