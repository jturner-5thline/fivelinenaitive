CREATE FUNCTION public.apply_approved_paro_lender_correction_20261105(_updates jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $fn$
DECLARE r record; d public.deal_lenders%ROWTYPE; target_time timestamptz; before_rows jsonb; after_rows jsonb; trigger_states jsonb; result jsonb := '[]'::jsonb;
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Privileged maintenance only'; END IF;
  IF jsonb_array_length(_updates) <> 11 THEN RAISE EXCEPTION 'Exactly 11 approved records required'; END IF;
  LOCK TABLE public.deal_lenders IN SHARE ROW EXCLUSIVE MODE;
  SELECT jsonb_agg(to_jsonb(dl) ORDER BY id) INTO before_rows FROM public.deal_lenders dl WHERE deal_id='b624a054-74ae-4a71-a74d-e59062e85863';
  IF EXISTS (SELECT 1 FROM public.activity_logs WHERE deal_id='b624a054-74ae-4a71-a74d-e59062e85863' AND metadata->>'correction_key'='paro-20261105') THEN RAISE EXCEPTION 'Correction already applied'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.deals WHERE id='b624a054-74ae-4a71-a74d-e59062e85863' AND company_id='44556c46-9127-4b12-b14e-d6fee784afcf') THEN RAISE EXCEPTION 'Deal tenant mismatch'; END IF;
  IF (SELECT count(DISTINCT x->>'name') FROM jsonb_array_elements(_updates) x)<>11 THEN RAISE EXCEPTION 'Duplicate targets'; END IF;
  FOR r IN SELECT * FROM jsonb_to_recordset(_updates) AS x(name text,day date,note text,new_reason text,expected_hash text) LOOP
    IF r.name NOT IN ('Eastward Capital Partners','LAGO Global Capital Management','TIMIA Capital','Change Capital','Decathlon Capital','Clearline Financial','VFI Corporate Finance','Wayflier','Revtek','Advantage Capital','Equal Capital') THEN RAISE EXCEPTION 'Unapproved lender'; END IF;
    SELECT * INTO STRICT d FROM public.deal_lenders WHERE deal_id='b624a054-74ae-4a71-a74d-e59062e85863' AND name=r.name;
    IF md5(to_jsonb(d)::text) <> r.expected_hash THEN RAISE EXCEPTION 'Record changed since preview: %',r.name; END IF;
    IF r.day IS NULL OR r.day < '2026-09-30'::date OR r.day > '2026-10-28'::date OR coalesce(r.note,'')='' THEN RAISE EXCEPTION 'Invalid approved input'; END IF;
    IF r.new_reason IS NOT NULL AND r.new_reason <> 'Flat or Declining Revenue Growth' THEN RAISE EXCEPTION 'Unapproved pass reason'; END IF;
  END LOOP;
  SELECT jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled)) INTO trigger_states FROM pg_trigger WHERE tgrelid='public.deal_lenders'::regclass AND NOT tgisinternal AND tgname IN ('agent_trigger_on_lenders','on_lender_change_notify_email','trg_capture_lender_recommendation_outcome','trg_deal_lenders_status_timestamps','update_deal_lenders_updated_at','webhook_sync_deal_lenders_update');
  FOR r IN SELECT * FROM jsonb_to_recordset(trigger_states) AS x(name text,enabled text) LOOP EXECUTE format('ALTER TABLE public.deal_lenders DISABLE TRIGGER %I',r.name); END LOOP;
  FOR r IN SELECT * FROM jsonb_to_recordset(_updates) AS x(name text,day date,note text,new_reason text,expected_hash text) LOOP
    SELECT * INTO STRICT d FROM public.deal_lenders WHERE deal_id='b624a054-74ae-4a71-a74d-e59062e85863' AND name=r.name;
    target_time := (r.day+time '12:00') AT TIME ZONE 'America/Chicago';
    UPDATE public.deal_lenders SET stage='passed',tracking_status='passed',passed_at=target_time,last_status_change_at=target_time,
      pass_reason=CASE WHEN nullif(btrim(d.pass_reason),'') IS NOT NULL THEN d.pass_reason ELSE r.new_reason END,
      notes=r.note || CASE WHEN coalesce(d.notes,'')<>'' THEN E'\n\n'||d.notes ELSE '' END WHERE id=d.id;
    INSERT INTO public.activity_logs(deal_id,activity_type,description,metadata,created_at,user_display_name)
    VALUES(d.deal_id,'lender_stage_change',d.name||' pass response recorded',jsonb_build_object('lender_id',d.id,'lender_name',d.name,'from',d.stage,'to','Passed','status_note',r.note,'pass_reason',coalesce(nullif(btrim(d.pass_reason),''),r.new_reason),'passed_at',target_time,'last_status_change_at',target_time,'source','user_approved_historical_correction','recorded_at',now(),'correction_key','paro-20261105'),target_time,'User-approved update');
    SELECT result || jsonb_build_array(jsonb_build_object('name',name,'stage',stage,'date',passed_at AT TIME ZONE 'America/Chicago','notes',notes,'pass_reason',pass_reason)) INTO result FROM public.deal_lenders WHERE id=d.id;
  END LOOP;
  FOR r IN SELECT * FROM jsonb_to_recordset(trigger_states) AS x(name text,enabled text) LOOP
    EXECUTE format('ALTER TABLE public.deal_lenders %s TRIGGER %I',CASE r.enabled WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,r.name);
  END LOOP;
  SELECT jsonb_agg(to_jsonb(dl) ORDER BY id) INTO after_rows FROM public.deal_lenders dl WHERE deal_id='b624a054-74ae-4a71-a74d-e59062e85863';
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(before_rows) b JOIN jsonb_array_elements(after_rows) a ON a->>'id'=b->>'id' WHERE (a-ARRAY['stage','tracking_status','notes','pass_reason','passed_at','last_status_change_at']) IS DISTINCT FROM (b-ARRAY['stage','tracking_status','notes','pass_reason','passed_at','last_status_change_at'])) THEN RAISE EXCEPTION 'Unrelated fields changed'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(before_rows) b JOIN jsonb_array_elements(after_rows) a ON a->>'id'=b->>'id' WHERE b->>'name' IN ('Creditfy','Milestone Bank','Montage Capital','North Axis Partners') AND a IS DISTINCT FROM b) THEN RAISE EXCEPTION 'Excluded lender changed'; END IF;
  RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION public.apply_approved_paro_lender_correction_20261105(jsonb) FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON FUNCTION public.apply_approved_paro_lender_correction_20261105(jsonb) IS 'One-time postgres-only approved Paro correction; table lock, exact preview hash guards, transaction-local trigger suspension/restoration, excluded-field assertions, duplicate-run prevention. Not exposed to application users.';