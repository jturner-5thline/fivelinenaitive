-- Invoker functions only: existing table schema, grants, policies and triggers stay intact.
CREATE OR REPLACE FUNCTION public.mcp_outstanding_state(p_status text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE s jsonb;
BEGIN
  BEGIN s := p_status::jsonb; EXCEPTION WHEN invalid_text_representation THEN s := NULL; END;
  IF jsonb_typeof(s) = 'object' THEN
    RETURN jsonb_build_object('received', s->'received' = 'true'::jsonb, 'approved', s->'approved' = 'true'::jsonb,
      'deliveredToLenders', CASE WHEN jsonb_typeof(s->'deliveredToLenders')='array' THEN s->'deliveredToLenders' ELSE '[]'::jsonb END,
      'requestedBy', CASE WHEN jsonb_typeof(s->'requestedBy')='array' THEN s->'requestedBy' ELSE '[]'::jsonb END);
  END IF;
  RETURN jsonb_build_object('received', p_status IN ('received','approved','delivered'),
    'approved', p_status IN ('approved','delivered'), 'deliveredToLenders', CASE WHEN p_status='delivered' THEN '["all"]'::jsonb ELSE '[]'::jsonb END, 'requestedBy','[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.mcp_outstanding_state(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_outstanding_state(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.mcp_list_outstanding_items(p_deal_id uuid, p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE n integer := COALESCE((p_filters->>'limit')::integer,100); off integer := COALESCE((p_filters->>'offset')::integer,0); result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.deals WHERE id=p_deal_id) THEN RAISE EXCEPTION 'Deal not found or inaccessible' USING ERRCODE='42501'; END IF;
  IF n NOT BETWEEN 1 AND 500 OR off NOT BETWEEN 0 AND 1000000 THEN RAISE EXCEPTION 'Invalid pagination'; END IF;
  IF p_filters ? 'status' AND p_filters->>'status' NOT IN ('requested','received','submitted') THEN RAISE EXCEPTION 'status must be requested, received or submitted'; END IF;
  WITH filtered AS MATERIALIZED (
    SELECT i.*, public.mcp_outstanding_state(i.status) AS state FROM public.outstanding_items i
    WHERE i.deal_id=p_deal_id
      AND (COALESCE((p_filters->>'include_archived')::boolean,false) OR NOT i.is_archived)
      AND (p_filters->>'lender_id' IS NULL OR i.lender_id=(p_filters->>'lender_id')::uuid)
      AND (p_filters->>'updated_since' IS NULL OR i.updated_at>(p_filters->>'updated_since')::timestamptz)
  ), matched AS MATERIALIZED (
    SELECT * FROM filtered WHERE
      (NOT COALESCE((p_filters->>'open_only')::boolean,false) OR NOT (COALESCE((state->>'received')::boolean,false) AND COALESCE((state->>'approved')::boolean,false)))
      AND (p_filters->>'status' IS NULL OR CASE WHEN COALESCE((state->>'approved')::boolean,false) THEN 'submitted' WHEN COALESCE((state->>'received')::boolean,false) THEN 'received' ELSE 'requested' END = p_filters->>'status')
  ), page AS (SELECT * FROM matched ORDER BY position,created_at,id LIMIT n OFFSET off)
  SELECT jsonb_build_object('items',COALESCE((SELECT jsonb_agg(to_jsonb(page)-'state' ORDER BY position,created_at,id) FROM page),'[]'::jsonb),
    'total_count',(SELECT count(*) FROM matched),'has_more',(SELECT count(*) FROM matched)>off+n,
    'next_offset',CASE WHEN (SELECT count(*) FROM matched)>off+n THEN off+n ELSE NULL END) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.mcp_list_outstanding_items(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_list_outstanding_items(uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.mcp_write_outstanding_item(p_action text,p_deal_id uuid,p_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE caller uuid := auth.uid(); item public.outstanding_items%ROWTYPE; old_item jsonb; state jsonb;
  deal uuid := p_deal_id; metadata jsonb; key text; target uuid; requester text; pos integer; k text;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  IF p_action NOT IN ('create','update') OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid item operation'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_payload) LOOP
    IF (p_action='create' AND k NOT IN ('description','lender_id','status','priority','due_date','eta','assigned_to','notes','source_metadata','idempotency_key'))
      OR (p_action='update' AND k NOT IN ('description','lender_id','status','priority','due_date','eta','assigned_to','notes','is_archived','source_metadata_merge','append_note')) THEN RAISE EXCEPTION 'Unknown item field: %',k; END IF;
  END LOOP;
  IF p_action='update' THEN
    SELECT deal_id INTO deal FROM public.outstanding_items WHERE id=p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item not found or inaccessible' USING ERRCODE='42501'; END IF;
  END IF;
  IF deal IS NULL OR NOT EXISTS (SELECT 1 FROM public.deals WHERE id=deal) THEN RAISE EXCEPTION 'Deal not found or inaccessible' USING ERRCODE='42501'; END IF;
  -- Serializes MCP create allocation, dedupe, note appends and metadata merges for this deal.
  PERFORM pg_advisory_xact_lock(hashtextextended('mcp_outstanding_items:'||deal::text,0));
  IF p_action='update' THEN
    SELECT * INTO item FROM public.outstanding_items WHERE id=p_id AND deal_id=deal FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item not found or inaccessible' USING ERRCODE='42501'; END IF;
    old_item := to_jsonb(item);
    state := public.mcp_outstanding_state(item.status);
    metadata := COALESCE(item.source_metadata,'{}'::jsonb);
    IF p_payload='{}'::jsonb THEN RAISE EXCEPTION 'Supply at least one field to update'; END IF;
  ELSE
    metadata := COALESCE(p_payload->'source_metadata','{}'::jsonb);
    key := COALESCE(p_payload->>'idempotency_key',metadata->>'idempotency_key');
    IF p_payload ? 'idempotency_key' AND metadata ? 'idempotency_key' AND key IS DISTINCT FROM metadata->>'idempotency_key' THEN RAISE EXCEPTION 'Conflicting idempotency keys'; END IF;
    IF key IS NOT NULL THEN
      IF btrim(key)='' OR length(key)>200 THEN RAISE EXCEPTION 'Invalid idempotency key'; END IF;
      SELECT * INTO item FROM public.outstanding_items WHERE deal_id=deal AND source_metadata->>'idempotency_key'=key ORDER BY created_at,id LIMIT 1;
      IF FOUND THEN RETURN jsonb_build_object('item',to_jsonb(item),'created',false); END IF;
      metadata := metadata || jsonb_build_object('idempotency_key',key);
    END IF;
    state := '{"received":false,"approved":false,"deliveredToLenders":[],"requestedBy":[]}'::jsonb;
  END IF;
  IF p_payload ? 'source_metadata_merge' THEN
    IF jsonb_typeof(p_payload->'source_metadata_merge') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'source_metadata_merge must be an object'; END IF;
    IF p_payload->'source_metadata_merge' ? 'idempotency_key' AND p_payload->'source_metadata_merge'->>'idempotency_key' IS DISTINCT FROM metadata->>'idempotency_key' THEN RAISE EXCEPTION 'An item idempotency key cannot be changed'; END IF;
    metadata := metadata || (p_payload->'source_metadata_merge');
  END IF;
  IF jsonb_typeof(metadata) IS DISTINCT FROM 'object' OR length(metadata::text)>20000 THEN RAISE EXCEPTION 'Metadata must be an object of at most 20,000 characters'; END IF;
  IF p_action='create' OR p_payload ? 'description' THEN
    IF COALESCE(btrim(p_payload->>'description'),'')='' OR length(btrim(p_payload->>'description'))>2000 THEN RAISE EXCEPTION 'description must be 1 to 2000 characters'; END IF;
  END IF;
  IF p_payload ? 'priority' AND (p_payload->>'priority' IS NULL OR p_payload->>'priority' NOT IN ('normal','high','urgent')) THEN RAISE EXCEPTION 'priority must be normal, high or urgent'; END IF;
  IF p_payload ? 'status' THEN
    IF p_payload->>'status' IS NULL OR p_payload->>'status' NOT IN ('requested','received','submitted') THEN RAISE EXCEPTION 'status must be requested, received or submitted'; END IF;
    state := state || jsonb_build_object('received',p_payload->>'status' IN ('received','submitted'),'approved',p_payload->>'status'='submitted');
  END IF;
  IF p_payload ? 'lender_id' THEN
    target := (p_payload->>'lender_id')::uuid;
    IF target IS NOT NULL THEN
      SELECT name INTO requester FROM public.deal_lenders WHERE id=target AND deal_id=deal;
      IF NOT FOUND THEN RAISE EXCEPTION 'Funding source is not attached to this deal; use deal_lenders.id' USING ERRCODE='22023'; END IF;
      IF p_action='create' THEN state := state || jsonb_build_object('requestedBy',jsonb_build_array(requester)); END IF;
    END IF;
  END IF;
  IF p_payload ? 'notes' AND p_payload ? 'append_note' THEN RAISE EXCEPTION 'Supply notes or append_note, not both'; END IF;
  IF length(p_payload->>'notes')>10000 OR length(p_payload->>'assigned_to')>500 THEN RAISE EXCEPTION 'Notes or assignment exceeds maximum length'; END IF;
  IF p_payload ? 'append_note' AND (COALESCE(btrim(p_payload->>'append_note'),'')='' OR length(p_payload->>'append_note')>10000) THEN RAISE EXCEPTION 'append_note must be 1 to 10000 characters'; END IF;
  IF p_action='create' THEN
    SELECT COALESCE(max(position)+1,0) INTO pos FROM public.outstanding_items WHERE deal_id=deal AND NOT is_archived;
    INSERT INTO public.outstanding_items(deal_id,lender_id,description,status,priority,due_date,eta,assigned_to,notes,user_id,position,source_metadata,is_archived)
    VALUES(deal,target,btrim(p_payload->>'description'),state::text,COALESCE(p_payload->>'priority','normal'),(p_payload->>'due_date')::date,(p_payload->>'eta')::date,NULLIF(p_payload->>'assigned_to',''),p_payload->>'notes',caller,pos,metadata,false)
    RETURNING * INTO item;
  ELSE
    UPDATE public.outstanding_items SET
      description=CASE WHEN p_payload ? 'description' THEN btrim(p_payload->>'description') ELSE item.description END,
      status=CASE WHEN p_payload ? 'status' THEN state::text ELSE item.status END,
      priority=CASE WHEN p_payload ? 'priority' THEN p_payload->>'priority' ELSE item.priority END,
      due_date=CASE WHEN p_payload ? 'due_date' THEN (p_payload->>'due_date')::date ELSE item.due_date END,
      eta=CASE WHEN p_payload ? 'eta' THEN (p_payload->>'eta')::date ELSE item.eta END,
      assigned_to=CASE WHEN p_payload ? 'assigned_to' THEN NULLIF(p_payload->>'assigned_to','') ELSE item.assigned_to END,
      lender_id=CASE WHEN p_payload ? 'lender_id' THEN target ELSE item.lender_id END,
      notes=CASE WHEN p_payload ? 'append_note' THEN COALESCE(item.notes,'')||E'\n'||to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD')||': '||(p_payload->>'append_note') WHEN p_payload ? 'notes' THEN p_payload->>'notes' ELSE item.notes END,
      is_archived=CASE WHEN p_payload ? 'is_archived' THEN (p_payload->>'is_archived')::boolean ELSE item.is_archived END,
      source_metadata=CASE WHEN p_payload ? 'source_metadata_merge' THEN metadata ELSE item.source_metadata END,updated_at=now()
    WHERE id=p_id RETURNING * INTO item;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item update denied' USING ERRCODE='42501'; END IF;
  END IF;
  INSERT INTO public.activity_logs(deal_id,user_id,user_display_name,activity_type,description,metadata)
  VALUES(deal,caller,'MCP agent',CASE WHEN p_action='create' THEN 'requested_item_added' ELSE 'requested_item_updated' END,
    '[MCP] '||CASE WHEN p_action='create' THEN 'Added Open Item: ' ELSE 'Updated Open Item: ' END||item.description,
    jsonb_build_object('source','MCP agent','item_id',item.id,'before',COALESCE(old_item,'{}'::jsonb),'after',to_jsonb(item)));
  RETURN jsonb_build_object('item',to_jsonb(item),'created',p_action='create');
END $$;
REVOKE ALL ON FUNCTION public.mcp_write_outstanding_item(text,uuid,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_write_outstanding_item(text,uuid,uuid,jsonb) TO authenticated;
