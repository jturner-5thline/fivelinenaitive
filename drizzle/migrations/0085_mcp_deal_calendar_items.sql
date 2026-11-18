ALTER TABLE public.deal_calendar_items ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_deal_calendar_items_idem ON public.deal_calendar_items(deal_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.mcp_write_deal_calendar_item(p_action text, p_deal_id uuid, p_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.deal_calendar_items;
  v_before public.deal_calendar_items;
  v_key text := nullif(btrim(p_payload->>'idempotency_key'), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_action = 'create' THEN
    IF NOT EXISTS (SELECT 1 FROM public.deals WHERE id = p_deal_id) THEN RAISE EXCEPTION 'Deal not found or not accessible'; END IF;
    PERFORM pg_advisory_xact_lock(hashtext('deal_calendar:' || p_deal_id::text));
    IF v_key IS NOT NULL THEN
      SELECT * INTO v_row FROM public.deal_calendar_items WHERE deal_id = p_deal_id AND idempotency_key = v_key;
      IF FOUND THEN RETURN jsonb_build_object('created', false, 'item', to_jsonb(v_row)); END IF;
    END IF;
    INSERT INTO public.deal_calendar_items(deal_id, title, date, time, notes, type, created_by, idempotency_key)
    VALUES (p_deal_id, p_payload->>'title', (p_payload->>'date')::date, nullif(p_payload->>'time','')::time,
            nullif(p_payload->>'notes',''), coalesce(p_payload->>'type','note')::public.deal_calendar_item_type, v_uid, v_key)
    RETURNING * INTO v_row;
    INSERT INTO public.deal_activity(deal_id, user_id, source, action_type, before, after)
    VALUES (p_deal_id, v_uid, 'mcp', 'calendar_item_added', '{}'::jsonb, to_jsonb(v_row));
    RETURN jsonb_build_object('created', true, 'item', to_jsonb(v_row));
  END IF;

  SELECT * INTO v_before FROM public.deal_calendar_items WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Calendar item not found or not accessible'; END IF;

  IF p_action = 'update' THEN
    UPDATE public.deal_calendar_items SET
      title = CASE WHEN p_payload ? 'title' THEN p_payload->>'title' ELSE title END,
      date = CASE WHEN p_payload ? 'date' THEN (p_payload->>'date')::date ELSE date END,
      time = CASE WHEN p_payload ? 'time' THEN nullif(p_payload->>'time','')::time ELSE time END,
      notes = CASE WHEN p_payload ? 'notes' THEN nullif(p_payload->>'notes','') ELSE notes END,
      type = CASE WHEN p_payload ? 'type' THEN (p_payload->>'type')::public.deal_calendar_item_type ELSE type END
    WHERE id = p_id RETURNING * INTO v_row;
    IF NOT FOUND THEN RAISE EXCEPTION 'Calendar item not found or not accessible'; END IF;
    INSERT INTO public.deal_activity(deal_id, user_id, source, action_type, before, after)
    VALUES (v_row.deal_id, v_uid, 'mcp', 'calendar_item_updated', to_jsonb(v_before), to_jsonb(v_row));
    RETURN jsonb_build_object('updated', true, 'item', to_jsonb(v_row));
  ELSIF p_action = 'delete' THEN
    DELETE FROM public.deal_calendar_items WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Calendar item not found or not accessible'; END IF;
    INSERT INTO public.deal_activity(deal_id, user_id, source, action_type, before, after)
    VALUES (v_before.deal_id, v_uid, 'mcp', 'calendar_item_deleted', to_jsonb(v_before), '{}'::jsonb);
    RETURN jsonb_build_object('deleted', true, 'item', to_jsonb(v_before));
  END IF;
  RAISE EXCEPTION 'Unknown action';
END $$;
REVOKE ALL ON FUNCTION public.mcp_write_deal_calendar_item(text, uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_write_deal_calendar_item(text, uuid, uuid, jsonb) TO authenticated;