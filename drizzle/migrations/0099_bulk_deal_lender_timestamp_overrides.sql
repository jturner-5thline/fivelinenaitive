CREATE OR REPLACE FUNCTION public.mcp_bulk_upsert_deal_lenders(p_rows jsonb, p_mode text DEFAULT 'upsert', p_dry_run boolean DEFAULT true, p_source text DEFAULT 'mcp')
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  item jsonb; i int := 0; out jsonb := '[]'::jsonb;
  v_deal uuid; v_lender uuid; v_company uuid; v_name text; v_stage text; v_ts text; v_notes text; v_pass text;
  v_date timestamptz; v_contact uuid; ex public.deal_lenders; nr public.deal_lenders; col text; changes jsonb; outcome text; timestamps jsonb; k text; before_timestamps jsonb;
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
      timestamps := coalesce(item->'timestamps', '{}'::jsonb);
      IF jsonb_typeof(timestamps) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'timestamps must be an object'; END IF;
      FOR k IN SELECT jsonb_object_keys(timestamps) LOOP
        IF k NOT IN ('submitted_at','approved_at','passed_at','declined_at','excluded_at','on_hold_at','on_deck_at','last_status_change_at') THEN RAISE EXCEPTION 'Timestamp field % is not editable', k; END IF;
        IF jsonb_typeof(timestamps->k) NOT IN ('string','null') THEN RAISE EXCEPTION 'Timestamp % must be ISO or null', k; END IF;
        IF timestamps->>k IS NOT NULL THEN
          IF (timestamps->>k) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2}))?$' THEN RAISE EXCEPTION 'Timestamp % must be ISO or null', k; END IF;
          PERFORM (timestamps->>k)::timestamptz;
        END IF;
      END LOOP;
      SELECT company_id INTO v_company FROM public.deals WHERE id = v_deal;
      IF v_company IS NULL THEN RAISE EXCEPTION 'Deal not found, inaccessible, or missing company scope'; END IF;
      SELECT name INTO v_name FROM public.master_lenders WHERE id = v_lender AND company_id = v_company;
      IF v_name IS NULL THEN RAISE EXCEPTION 'Lender not found in this deal''s company'; END IF;
      IF v_contact IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.lender_contacts WHERE id = v_contact AND lender_id = v_lender) THEN
        RAISE EXCEPTION 'selected_contact_id must be a contact of this funding source';
      END IF;
      SELECT * INTO ex FROM public.deal_lenders WHERE deal_id = v_deal AND master_lender_id = v_lender LIMIT 1 FOR UPDATE;
      IF FOUND THEN
        IF p_mode = 'insert_only' THEN
          out := out || jsonb_build_object('index', i, 'deal_id', v_deal, 'lender_id', v_lender, 'deal_lender_id', ex.id, 'outcome', 'skipped_existing', 'stage', ex.stage);
          CONTINUE;
        END IF;
        IF (v_stage IS NULL OR v_stage = ex.stage) AND (v_ts IS NULL OR v_ts IS NOT DISTINCT FROM ex.tracking_status)
           AND (v_notes IS NULL OR position(v_notes in coalesce(ex.notes,'')) > 0)
           AND (v_pass IS NULL OR v_pass IS NOT DISTINCT FROM ex.pass_reason)
           AND (v_contact IS NULL OR v_contact IS NOT DISTINCT FROM ex.selected_contact_id)
           AND timestamps = '{}'::jsonb THEN
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
          changes := changes || jsonb_build_object('last_status_change_at', v_date);
          IF col IS NOT NULL THEN changes := changes || jsonb_build_object(col, v_date); END IF;
        END IF;
        changes := changes || timestamps;
        before_timestamps := '{}'::jsonb;
        FOR k IN SELECT jsonb_object_keys(timestamps) LOOP before_timestamps := before_timestamps || jsonb_build_object(k, to_jsonb(ex)->k); END LOOP;
        nr := public.mcp_update_deal_lender_row(v_deal, ex.id, changes, true);
        INSERT INTO public.deal_activity (deal_id, user_id, source, action_type, before, after)
          VALUES (v_deal, auth.uid(), p_source, 'lender_updated', jsonb_build_object('lender_name', ex.name, 'lender_id', ex.id, 'stage', ex.stage, 'tracking_status', ex.tracking_status) || before_timestamps, jsonb_build_object('lender_name', ex.name, 'lender_id', ex.id) || changes);
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
          IF col IS NOT NULL THEN EXECUTE format('UPDATE public.deal_lenders SET %I = $1 WHERE id = $2 RETURNING *', col) INTO nr USING v_date, nr.id; END IF;
        END IF;
        IF timestamps <> '{}'::jsonb THEN nr := public.mcp_update_deal_lender_row(v_deal, nr.id, timestamps, true); END IF;
        PERFORM set_config('app.dl_raw_timestamps', 'off', true);
        INSERT INTO public.deal_activity (deal_id, user_id, source, action_type, before, after)
          VALUES (v_deal, auth.uid(), p_source, 'lender_added', '{}'::jsonb, jsonb_build_object('lender_name', v_name, 'lender_id', nr.id, 'master_lender_id', v_lender, 'stage', nr.stage, 'status_date', v_date) || timestamps);
        out := out || jsonb_build_object('index', i, 'deal_id', v_deal, 'lender_id', v_lender, 'deal_lender_id', nr.id, 'outcome', 'inserted', 'stage', nr.stage);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      PERFORM set_config('app.dl_raw_timestamps', 'off', true);
      out := out || jsonb_build_object('index', i, 'deal_id', item->>'deal_id', 'lender_id', item->>'lender_id', 'outcome', 'error', 'reason', SQLERRM);
    END;
  END LOOP;
  RETURN out;
END $$;
REVOKE ALL ON FUNCTION public.mcp_bulk_upsert_deal_lenders(jsonb, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_bulk_upsert_deal_lenders(jsonb, text, boolean, text) TO authenticated;