CREATE OR REPLACE FUNCTION public.mcp_reorder_deal_milestones(p_deal_id uuid, p_target uuid, p_index integer)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_ids uuid[]; v_i integer := 0; v_id uuid;
BEGIN
  SELECT coalesce(array_agg(id ORDER BY position, created_at, id), '{}') INTO v_ids
  FROM public.deal_milestones WHERE deal_id = p_deal_id AND (p_target IS NULL OR id <> p_target);
  IF p_target IS NOT NULL THEN
    p_index := greatest(0, least(coalesce(p_index, cardinality(v_ids)), cardinality(v_ids)));
    v_ids := v_ids[1:p_index] || p_target || v_ids[p_index+1:cardinality(v_ids)];
  END IF;
  FOREACH v_id IN ARRAY v_ids LOOP
    UPDATE public.deal_milestones SET position = v_i WHERE id = v_id AND position IS DISTINCT FROM v_i;
    v_i := v_i + 1;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.mcp_reorder_deal_milestones(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_reorder_deal_milestones(uuid, uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.mcp_write_deal_milestone(p_action text, p_deal_id uuid, p_id uuid, p_payload jsonb, p_expected_updated_at timestamptz DEFAULT NULL, p_dry_run boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_before public.deal_milestones;
  v_row public.deal_milestones;
  v_deal uuid;
  v_result jsonb;
  v_action text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_action NOT IN ('create','update','delete') THEN RAISE EXCEPTION 'Unknown action'; END IF;
  IF p_action = 'create' THEN
    IF NOT EXISTS (SELECT 1 FROM public.deals WHERE id = p_deal_id) THEN RAISE EXCEPTION 'Deal not found or not accessible'; END IF;
    v_deal := p_deal_id;
  ELSE
    SELECT * INTO v_before FROM public.deal_milestones WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Milestone not found or not accessible'; END IF;
    v_deal := v_before.deal_id;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('deal_milestones:' || v_deal::text));
  IF p_action <> 'create' THEN
    SELECT * INTO v_before FROM public.deal_milestones WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Milestone not found or not accessible'; END IF;
    IF p_expected_updated_at IS NOT NULL AND v_before.updated_at <> p_expected_updated_at THEN
      RETURN jsonb_build_object('conflict', true, 'message', 'Milestone changed since expected_updated_at', 'current', to_jsonb(v_before));
    END IF;
  END IF;

  BEGIN
    IF p_action = 'create' THEN
      INSERT INTO public.deal_milestones(deal_id, user_id, title, due_date, status, position)
      VALUES (v_deal, v_uid, btrim(p_payload->>'title'), nullif(p_payload->>'due_date','')::timestamptz,
              nullif(p_payload->>'status',''), 2147483647)
      RETURNING id INTO p_id;
      PERFORM public.mcp_reorder_deal_milestones(v_deal, p_id, (p_payload->>'position')::int);
      SELECT * INTO v_row FROM public.deal_milestones WHERE id = p_id;
      v_action := 'milestone_added';
    ELSIF p_action = 'update' THEN
      UPDATE public.deal_milestones SET
        title = CASE WHEN p_payload ? 'title' THEN btrim(p_payload->>'title') ELSE title END,
        due_date = CASE WHEN p_payload ? 'due_date' THEN nullif(p_payload->>'due_date','')::timestamptz ELSE due_date END,
        status = CASE WHEN p_payload ? 'status' THEN nullif(p_payload->>'status','') ELSE status END,
        completed = CASE WHEN p_payload ? 'completed' THEN (p_payload->>'completed')::boolean ELSE completed END,
        completed_at = CASE WHEN p_payload ? 'completed' THEN
            CASE WHEN (p_payload->>'completed')::boolean THEN CASE WHEN completed THEN completed_at ELSE now() END ELSE NULL END
          ELSE completed_at END
      WHERE id = p_id;
      IF p_payload ? 'position' THEN
        PERFORM public.mcp_reorder_deal_milestones(v_deal, p_id, (p_payload->>'position')::int);
      END IF;
      SELECT * INTO v_row FROM public.deal_milestones WHERE id = p_id;
      v_action := 'milestone_updated';
    ELSE
      DELETE FROM public.deal_milestones WHERE id = p_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Milestone not found or not accessible'; END IF;
      PERFORM public.mcp_reorder_deal_milestones(v_deal, NULL, NULL);
      v_action := 'milestone_deleted';
    END IF;

    INSERT INTO public.deal_activity(deal_id, user_id, source, action_type, before, after)
    VALUES (v_deal, v_uid, 'mcp', v_action, coalesce(to_jsonb(v_before), '{}'::jsonb), coalesce(to_jsonb(v_row), '{}'::jsonb));
    INSERT INTO public.deal_audit_log(deal_id, user_id, action_type, entity_type, entity_id, entity_name, metadata, source)
    VALUES (v_deal, v_uid, v_action, 'deal_milestone', p_id::text, coalesce(v_row.title, v_before.title),
            jsonb_build_object('before', to_jsonb(v_before), 'after', to_jsonb(v_row), 'payload', p_payload), 'mcp');

    v_result := jsonb_build_object('dry_run', p_dry_run, 'action', p_action,
      'milestone', CASE WHEN p_action = 'delete' THEN to_jsonb(v_before) ELSE to_jsonb(v_row) END,
      'before', to_jsonb(v_before),
      'milestones', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'position', position) ORDER BY position), '[]') FROM public.deal_milestones WHERE deal_id = v_deal));
    IF p_dry_run THEN RAISE EXCEPTION USING ERRCODE = 'P0D01', MESSAGE = v_result::text; END IF;
  EXCEPTION WHEN SQLSTATE 'P0D01' THEN
    v_result := SQLERRM::jsonb;
  END;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.mcp_write_deal_milestone(text, uuid, uuid, jsonb, timestamptz, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_write_deal_milestone(text, uuid, uuid, jsonb, timestamptz, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.mcp_set_stage_milestone(p_deal_id uuid, p_stage text, p_milestone_key text, p_completed boolean, p_label text, p_expected_updated_at timestamptz DEFAULT NULL, p_dry_run boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_before public.naitive_stage_milestones;
  v_row public.naitive_stage_milestones;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.deals WHERE id = p_deal_id) THEN RAISE EXCEPTION 'Deal not found or not accessible'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('stage_milestones:' || p_deal_id::text));
  SELECT * INTO v_before FROM public.naitive_stage_milestones
   WHERE deal_id = p_deal_id AND stage = p_stage AND milestone_key = p_milestone_key
   ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF FOUND AND p_expected_updated_at IS NOT NULL AND v_before.updated_at <> p_expected_updated_at THEN
    RETURN jsonb_build_object('conflict', true, 'message', 'Stage milestone changed since expected_updated_at', 'current', to_jsonb(v_before));
  END IF;
  BEGIN
    IF v_before.id IS NULL THEN
      INSERT INTO public.naitive_stage_milestones(deal_id, stage, milestone_key, completed, completed_at)
      VALUES (p_deal_id, p_stage, p_milestone_key, p_completed, CASE WHEN p_completed THEN now() END)
      RETURNING * INTO v_row;
    ELSE
      UPDATE public.naitive_stage_milestones SET completed = p_completed,
        completed_at = CASE WHEN p_completed THEN CASE WHEN completed THEN completed_at ELSE now() END ELSE NULL END
      WHERE id = v_before.id RETURNING * INTO v_row;
    END IF;
    INSERT INTO public.deal_activity(deal_id, user_id, source, action_type, before, after)
    VALUES (p_deal_id, v_uid, 'mcp', 'stage_milestone_set', coalesce(to_jsonb(v_before), '{}'::jsonb), to_jsonb(v_row));
    INSERT INTO public.deal_audit_log(deal_id, user_id, action_type, entity_type, entity_id, entity_name, metadata, source)
    VALUES (p_deal_id, v_uid, CASE WHEN p_completed THEN 'stage_milestone_completed' ELSE 'stage_milestone_uncompleted' END,
            'stage_milestone', v_row.id::text, p_label,
            jsonb_build_object('stage', p_stage, 'milestone_key', p_milestone_key, 'before', to_jsonb(v_before), 'after', to_jsonb(v_row)), 'mcp');
    v_result := jsonb_build_object('dry_run', p_dry_run, 'created', v_before.id IS NULL,
      'stage_milestone', to_jsonb(v_row) || jsonb_build_object('label', p_label), 'before', to_jsonb(v_before));
    IF p_dry_run THEN RAISE EXCEPTION USING ERRCODE = 'P0D01', MESSAGE = v_result::text; END IF;
  EXCEPTION WHEN SQLSTATE 'P0D01' THEN
    v_result := SQLERRM::jsonb;
  END;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.mcp_set_stage_milestone(uuid, text, text, boolean, text, timestamptz, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_set_stage_milestone(uuid, text, text, boolean, text, timestamptz, boolean) TO authenticated;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='naitive_stage_milestones') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.naitive_stage_milestones;
  END IF;
END $$;