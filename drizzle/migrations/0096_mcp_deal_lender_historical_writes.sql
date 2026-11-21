CREATE OR REPLACE FUNCTION public.deal_lenders_set_status_timestamps()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE
  new_bucket text; old_bucket text; allow_clear text; raw_ts text;
BEGIN
  BEGIN raw_ts := current_setting('app.dl_raw_timestamps', true); EXCEPTION WHEN OTHERS THEN raw_ts := NULL; END;
  IF coalesce(raw_ts,'') = 'on' THEN RETURN NEW; END IF;

  new_bucket := public._deal_lender_status_bucket(NEW.stage, NEW.substage, NEW.tracking_status);
  IF TG_OP = 'INSERT' THEN
    IF new_bucket IN ('submitted','approved','passed','declined') AND NEW.submitted_at IS NULL THEN NEW.submitted_at := now(); END IF;
    IF new_bucket = 'approved' AND NEW.approved_at IS NULL THEN NEW.approved_at := now(); END IF;
    IF new_bucket = 'passed' AND NEW.passed_at IS NULL THEN NEW.passed_at := now(); END IF;
    IF new_bucket = 'declined' AND NEW.declined_at IS NULL THEN NEW.declined_at := now(); END IF;
    IF new_bucket = 'excluded' AND NEW.excluded_at IS NULL THEN NEW.excluded_at := now(); END IF;
    IF new_bucket = 'on_hold' AND NEW.on_hold_at IS NULL THEN NEW.on_hold_at := now(); END IF;
    IF new_bucket = 'on_deck' AND NEW.on_deck_at IS NULL THEN NEW.on_deck_at := now(); END IF;
    IF NEW.last_status_change_at IS NULL THEN NEW.last_status_change_at := now(); END IF;
    RETURN NEW;
  END IF;
  old_bucket := public._deal_lender_status_bucket(OLD.stage, OLD.substage, OLD.tracking_status);
  BEGIN allow_clear := current_setting('app.allow_clear', true); EXCEPTION WHEN OTHERS THEN allow_clear := NULL; END;
  IF coalesce(allow_clear,'') <> 'on' THEN
    IF NEW.submitted_at IS NULL AND OLD.submitted_at IS NOT NULL THEN NEW.submitted_at := OLD.submitted_at; END IF;
    IF NEW.passed_at IS NULL AND OLD.passed_at IS NOT NULL THEN NEW.passed_at := OLD.passed_at; END IF;
    IF NEW.declined_at IS NULL AND OLD.declined_at IS NOT NULL THEN NEW.declined_at := OLD.declined_at; END IF;
    IF NEW.approved_at IS NULL AND OLD.approved_at IS NOT NULL THEN NEW.approved_at := OLD.approved_at; END IF;
    IF NEW.excluded_at IS NULL AND OLD.excluded_at IS NOT NULL THEN NEW.excluded_at := OLD.excluded_at; END IF;
    IF NEW.on_hold_at IS NULL AND OLD.on_hold_at IS NOT NULL THEN NEW.on_hold_at := OLD.on_hold_at; END IF;
    IF NEW.on_deck_at IS NULL AND OLD.on_deck_at IS NOT NULL THEN NEW.on_deck_at := OLD.on_deck_at; END IF;
  END IF;
  IF NEW.submitted_at IS NULL AND new_bucket IN ('submitted','approved','passed','declined') THEN NEW.submitted_at := now(); END IF;
  IF new_bucket IS DISTINCT FROM old_bucket THEN
    IF new_bucket = 'approved' AND NEW.approved_at IS NULL THEN NEW.approved_at := now(); END IF;
    IF new_bucket = 'passed' AND NEW.passed_at IS NULL THEN NEW.passed_at := now(); END IF;
    IF new_bucket = 'declined' AND NEW.declined_at IS NULL THEN NEW.declined_at := now(); END IF;
    IF new_bucket = 'excluded' AND NEW.excluded_at IS NULL THEN NEW.excluded_at := now(); END IF;
    IF new_bucket = 'on_hold' AND NEW.on_hold_at IS NULL THEN NEW.on_hold_at := now(); END IF;
    IF new_bucket = 'on_deck' AND NEW.on_deck_at IS NULL THEN NEW.on_deck_at := now(); END IF;
    NEW.last_status_change_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

-- Maps a status bucket to the deal_lenders timestamp column it stamps.
CREATE OR REPLACE FUNCTION public.mcp_dl_stamp_column(_bucket text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _bucket WHEN 'submitted' THEN 'submitted_at' WHEN 'approved' THEN 'approved_at'
    WHEN 'passed' THEN 'passed_at' WHEN 'declined' THEN 'declined_at' WHEN 'excluded' THEN 'excluded_at'
    WHEN 'on_hold' THEN 'on_hold_at' WHEN 'on_deck' THEN 'on_deck_at' END
$$;

-- Caller-scoped partial update of one deal_lenders row. p_raw = write timestamps exactly as given (no now()).
CREATE OR REPLACE FUNCTION public.mcp_update_deal_lender_row(p_deal_id uuid, p_id uuid, p_changes jsonb, p_raw boolean DEFAULT false)
RETURNS public.deal_lenders LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r public.deal_lenders; c jsonb := coalesce(p_changes, '{}'::jsonb); k text;
BEGIN
  FOR k IN SELECT jsonb_object_keys(c) LOOP
    IF k NOT IN ('notes','stage','tracking_status','tags','quote_amount','quote_rate','quote_term','pass_reason',
      'submitted_at','approved_at','passed_at','declined_at','excluded_at','on_hold_at','on_deck_at','last_status_change_at','selected_contact_id') THEN
      RAISE EXCEPTION 'Field % is not editable', k;
    END IF;
  END LOOP;
  SELECT * INTO r FROM public.deal_lenders WHERE id = p_id AND deal_id = p_deal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Funding source is not on this deal or is inaccessible'; END IF;
  IF c ? 'selected_contact_id' AND c->>'selected_contact_id' IS NOT NULL THEN
    IF r.master_lender_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.lender_contacts lc
      WHERE lc.id = (c->>'selected_contact_id')::uuid AND lc.lender_id = r.master_lender_id) THEN
      RAISE EXCEPTION 'selected_contact_id must be a contact of this funding source';
    END IF;
  END IF;
  PERFORM set_config('app.dl_raw_timestamps', CASE WHEN p_raw THEN 'on' ELSE 'off' END, true);
  PERFORM set_config('app.allow_clear', 'on', true);
  UPDATE public.deal_lenders d SET
    notes = CASE WHEN c ? 'notes' THEN c->>'notes' ELSE d.notes END,
    stage = CASE WHEN c ? 'stage' THEN c->>'stage' ELSE d.stage END,
    tracking_status = CASE WHEN c ? 'tracking_status' THEN c->>'tracking_status' ELSE d.tracking_status END,
    tags = CASE WHEN c ? 'tags' THEN ARRAY(SELECT jsonb_array_elements_text(c->'tags')) ELSE d.tags END,
    quote_amount = CASE WHEN c ? 'quote_amount' THEN (c->>'quote_amount')::numeric ELSE d.quote_amount END,
    quote_rate = CASE WHEN c ? 'quote_rate' THEN (c->>'quote_rate')::numeric ELSE d.quote_rate END,
    quote_term = CASE WHEN c ? 'quote_term' THEN c->>'quote_term' ELSE d.quote_term END,
    pass_reason = CASE WHEN c ? 'pass_reason' THEN c->>'pass_reason' ELSE d.pass_reason END,
    submitted_at = CASE WHEN c ? 'submitted_at' THEN (c->>'submitted_at')::timestamptz ELSE d.submitted_at END,
    approved_at = CASE WHEN c ? 'approved_at' THEN (c->>'approved_at')::timestamptz ELSE d.approved_at END,
    passed_at = CASE WHEN c ? 'passed_at' THEN (c->>'passed_at')::timestamptz ELSE d.passed_at END,
    declined_at = CASE WHEN c ? 'declined_at' THEN (c->>'declined_at')::timestamptz ELSE d.declined_at END,
    excluded_at = CASE WHEN c ? 'excluded_at' THEN (c->>'excluded_at')::timestamptz ELSE d.excluded_at END,
    on_hold_at = CASE WHEN c ? 'on_hold_at' THEN (c->>'on_hold_at')::timestamptz ELSE d.on_hold_at END,
    on_deck_at = CASE WHEN c ? 'on_deck_at' THEN (c->>'on_deck_at')::timestamptz ELSE d.on_deck_at END,
    last_status_change_at = CASE WHEN c ? 'last_status_change_at' THEN (c->>'last_status_change_at')::timestamptz ELSE d.last_status_change_at END,
    selected_contact_id = CASE WHEN c ? 'selected_contact_id' THEN (c->>'selected_contact_id')::uuid ELSE d.selected_contact_id END,
    updated_at = now()
  WHERE d.id = p_id RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'Update was blocked (no permission to edit this funding source)'; END IF;
  PERFORM set_config('app.dl_raw_timestamps', 'off', true);
  PERFORM set_config('app.allow_clear', 'off', true);
  RETURN r;
END $$;

-- Caller-scoped bulk insert/upsert of deal funding sources with historical dates.
CREATE OR REPLACE FUNCTION public.mcp_bulk_upsert_deal_lenders(p_rows jsonb, p_mode text DEFAULT 'upsert', p_dry_run boolean DEFAULT true, p_source text DEFAULT 'mcp')
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  item jsonb; i int := 0; out jsonb := '[]'::jsonb;
  v_deal uuid; v_lender uuid; v_company uuid; v_name text; v_stage text; v_ts text; v_notes text; v_pass text;
  v_date timestamptz; v_contact uuid; ex public.deal_lenders; nr public.deal_lenders; col text; changes jsonb; outcome text;
BEGIN
  IF p_mode NOT IN ('insert_only','upsert') THEN RAISE EXCEPTION 'mode must be insert_only or upsert'; END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 500 THEN RAISE EXCEPTION 'rows must be an array of at most 500'; END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    i := i + 1;
    BEGIN
      v_deal := (item->>'deal_id')::uuid; v_lender := (item->>'lender_id')::uuid;
      IF v_deal IS NULL OR v_lender IS NULL THEN RAISE EXCEPTION 'deal_id and lender_id are required'; END IF;
      v_stage := nullif(btrim(item->>'stage'), ''); v_ts := nullif(btrim(item->>'tracking_status'), '');
      v_notes := nullif(item->>'notes', ''); v_pass := nullif(item->>'pass_reason', '');
      v_date := (item->>'status_date')::timestamptz; v_contact := (item->>'selected_contact_id')::uuid;
      SELECT company_id INTO v_company FROM public.deals WHERE id = v_deal;
      IF v_company IS NULL THEN RAISE EXCEPTION 'Deal not found, inaccessible, or missing company scope'; END IF;
      SELECT name INTO v_name FROM public.master_lenders WHERE id = v_lender AND company_id = v_company;
      IF v_name IS NULL THEN RAISE EXCEPTION 'Lender not found in this deal''s company'; END IF;
      IF v_contact IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.lender_contacts WHERE id = v_contact AND lender_id = v_lender) THEN
        RAISE EXCEPTION 'selected_contact_id must be a contact of this funding source';
      END IF;
      SELECT * INTO ex FROM public.deal_lenders WHERE deal_id = v_deal AND master_lender_id = v_lender LIMIT 1;
      IF FOUND THEN
        IF p_mode = 'insert_only' THEN
          out := out || jsonb_build_object('index', i, 'deal_id', v_deal, 'lender_id', v_lender, 'deal_lender_id', ex.id, 'outcome', 'skipped_existing', 'stage', ex.stage);
          CONTINUE;
        END IF;
        IF (v_stage IS NULL OR v_stage = ex.stage) AND (v_ts IS NULL OR v_ts IS NOT DISTINCT FROM ex.tracking_status)
           AND (v_notes IS NULL OR position(v_notes in coalesce(ex.notes,'')) > 0)
           AND (v_pass IS NULL OR v_pass IS NOT DISTINCT FROM ex.pass_reason)
           AND (v_contact IS NULL OR v_contact IS NOT DISTINCT FROM ex.selected_contact_id) THEN
          out := out || jsonb_build_object('index', i, 'deal_id', v_deal, 'lender_id', v_lender, 'deal_lender_id', ex.id, 'outcome', 'skipped_same', 'stage', ex.stage);
          CONTINUE;
        END IF;
        IF p_dry_run THEN
          out := out || jsonb_build_object('index', i, 'deal_id', v_deal, 'lender_id', v_lender, 'deal_lender_id', ex.id, 'outcome', 'would_update', 'stage', coalesce(v_stage, ex.stage), 'from_stage', ex.stage);
          CONTINUE;
        END IF;
        changes := '{}'::jsonb;
        IF v_stage IS NOT NULL THEN changes := changes || jsonb_build_object('stage', v_stage); END IF;
        IF v_ts IS NOT NULL THEN changes := changes || jsonb_build_object('tracking_status', v_ts); END IF;
        IF v_pass IS NOT NULL THEN changes := changes || jsonb_build_object('pass_reason', v_pass); END IF;
        IF v_contact IS NOT NULL THEN changes := changes || jsonb_build_object('selected_contact_id', v_contact); END IF;
        IF v_notes IS NOT NULL AND position(v_notes in coalesce(ex.notes,'')) = 0 THEN
          changes := changes || jsonb_build_object('notes', CASE WHEN coalesce(btrim(ex.notes),'') = '' THEN v_notes ELSE ex.notes || E'\n\n' || v_notes END);
          IF coalesce(btrim(ex.notes),'') <> '' THEN INSERT INTO public.lender_notes_history (deal_lender_id, text) VALUES (ex.id, ex.notes); END IF;
        END IF;
        IF v_date IS NOT NULL AND (v_stage IS DISTINCT FROM ex.stage OR v_ts IS DISTINCT FROM ex.tracking_status) THEN
          col := public.mcp_dl_stamp_column(public._deal_lender_status_bucket(coalesce(v_stage, ex.stage), ex.substage, coalesce(v_ts, ex.tracking_status)));
          changes := changes || jsonb_build_object(col, v_date, 'last_status_change_at', v_date);
        END IF;
        nr := public.mcp_update_deal_lender_row(v_deal, ex.id, changes, true);
        INSERT INTO public.deal_activity (deal_id, user_id, source, action_type, before, after)
          VALUES (v_deal, auth.uid(), p_source, 'lender_updated', jsonb_build_object('lender_name', ex.name, 'lender_id', ex.id, 'stage', ex.stage, 'tracking_status', ex.tracking_status), jsonb_build_object('lender_name', ex.name, 'lender_id', ex.id) || changes);
        out := out || jsonb_build_object('index', i, 'deal_id', v_deal, 'lender_id', v_lender, 'deal_lender_id', nr.id, 'outcome', 'updated', 'stage', nr.stage);
      ELSE
        IF p_dry_run THEN
          out := out || jsonb_build_object('index', i, 'deal_id', v_deal, 'lender_id', v_lender, 'outcome', 'would_insert', 'stage', coalesce(v_stage, 'on-deck'));
          CONTINUE;
        END IF;
        PERFORM set_config('app.dl_raw_timestamps', 'on', true);
        INSERT INTO public.deal_lenders (deal_id, name, master_lender_id, stage, tracking_status, notes, pass_reason, selected_contact_id, last_status_change_at)
          VALUES (v_deal, v_name, v_lender, coalesce(v_stage, 'on-deck'), coalesce(v_ts, 'active'), v_notes, v_pass, v_contact, v_date)
          RETURNING * INTO nr;
        IF v_date IS NOT NULL THEN
          col := public.mcp_dl_stamp_column(public._deal_lender_status_bucket(nr.stage, nr.substage, nr.tracking_status));
          EXECUTE format('UPDATE public.deal_lenders SET %I = $1 WHERE id = $2 RETURNING *', col) INTO nr USING v_date, nr.id;
        END IF;
        PERFORM set_config('app.dl_raw_timestamps', 'off', true);
        INSERT INTO public.deal_activity (deal_id, user_id, source, action_type, before, after)
          VALUES (v_deal, auth.uid(), p_source, 'lender_added', '{}'::jsonb, jsonb_build_object('lender_name', v_name, 'lender_id', nr.id, 'master_lender_id', v_lender, 'stage', nr.stage, 'status_date', v_date));
        out := out || jsonb_build_object('index', i, 'deal_id', v_deal, 'lender_id', v_lender, 'deal_lender_id', nr.id, 'outcome', 'inserted', 'stage', nr.stage);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      PERFORM set_config('app.dl_raw_timestamps', 'off', true);
      out := out || jsonb_build_object('index', i, 'deal_id', item->>'deal_id', 'lender_id', item->>'lender_id', 'outcome', 'error', 'reason', SQLERRM);
    END;
  END LOOP;
  RETURN out;
END $$;

-- Caller-scoped hard delete of one deal funding source with audit rows in the same transaction.
CREATE OR REPLACE FUNCTION public.mcp_delete_deal_lender(p_deal_id uuid, p_deal_lender_id uuid, p_master_lender_id uuid, p_reason text, p_source text DEFAULT 'mcp')
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r public.deal_lenders;
BEGIN
  IF (p_deal_lender_id IS NULL) = (p_master_lender_id IS NULL) THEN RAISE EXCEPTION 'Provide exactly one of deal_lender_id or lender_id'; END IF;
  SELECT * INTO r FROM public.deal_lenders WHERE deal_id = p_deal_id
    AND (id = p_deal_lender_id OR (p_deal_lender_id IS NULL AND master_lender_id = p_master_lender_id)) LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Funding source is not on this deal or is inaccessible'; END IF;
  DELETE FROM public.deal_lenders WHERE id = r.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Delete was blocked (no permission)'; END IF;
  INSERT INTO public.deal_audit_log (deal_id, user_id, action_type, entity_type, entity_id, entity_name, metadata, source)
    VALUES (p_deal_id, auth.uid(), 'lender_removed', 'deal_lender', r.id::text, r.name, jsonb_build_object('reason', p_reason, 'deleted_row', to_jsonb(r)), p_source);
  IF r.master_lender_id IS NOT NULL THEN
    INSERT INTO public.lender_audit_logs (lender_id, user_id, action, field_changed, old_value, metadata, source, change_reason)
      VALUES (r.master_lender_id, auth.uid(), 'removed_from_deal', 'deal_lenders', r.stage, jsonb_build_object('deal_id', p_deal_id, 'deal_lender_id', r.id), p_source, p_reason);
  END IF;
  INSERT INTO public.deal_activity (deal_id, user_id, source, action_type, before, after)
    VALUES (p_deal_id, auth.uid(), p_source, 'lender_removed', to_jsonb(r), jsonb_build_object('reason', p_reason));
  RETURN jsonb_build_object('deleted', jsonb_build_object('deal_lender_id', r.id, 'lender_id', r.master_lender_id, 'name', r.name, 'stage', r.stage));
END $$;

REVOKE ALL ON FUNCTION public.mcp_update_deal_lender_row(uuid, uuid, jsonb, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mcp_bulk_upsert_deal_lenders(jsonb, text, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mcp_delete_deal_lender(uuid, uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_update_deal_lender_row(uuid, uuid, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_bulk_upsert_deal_lenders(jsonb, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_delete_deal_lender(uuid, uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_dl_stamp_column(text) TO authenticated;