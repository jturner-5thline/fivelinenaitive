DO $mig$
DECLARE d text; o text;
BEGIN
 -- 1) merge: carry timestamps unchanged, earliest non-null wins on duplicate deal links
 d := pg_get_functiondef('public.mcp_merge_lenders'::regproc);
 o := $x$ PERFORM set_config('app.lender_merge_pair',p_keep::text||':'||p_merge::text,true);$x$;
 IF position(o in d)=0 THEN RAISE EXCEPTION 'merge anchor 1 missing'; END IF;
 d := replace(d, o, o || E'\n PERFORM set_config(''app.dl_raw_timestamps'',''on'',true);');
 o := $x$  UPDATE public.deal_lender_stage_events SET deal_lender_id = dup.keep_row WHERE deal_lender_id = dup.merge_row;$x$;
 IF position(o in d)=0 THEN RAISE EXCEPTION 'merge anchor 2 missing'; END IF;
 d := replace(d, o, $x$  oldj := (SELECT to_jsonb(t) FROM public.deal_lenders t WHERE id=dup.keep_row);
  UPDATE public.deal_lenders t SET
    submitted_at=LEAST(t.submitted_at,y.submitted_at), on_deck_at=LEAST(t.on_deck_at,y.on_deck_at), on_hold_at=LEAST(t.on_hold_at,y.on_hold_at),
    passed_at=LEAST(t.passed_at,y.passed_at), approved_at=LEAST(t.approved_at,y.approved_at), declined_at=LEAST(t.declined_at,y.declined_at),
    excluded_at=LEAST(t.excluded_at,y.excluded_at), last_contact_at=LEAST(t.last_contact_at,y.last_contact_at)
   FROM public.deal_lenders y WHERE t.id=dup.keep_row AND y.id=dup.merge_row
     AND (t.submitted_at,t.on_deck_at,t.on_hold_at,t.passed_at,t.approved_at,t.declined_at,t.excluded_at,t.last_contact_at) IS DISTINCT FROM
         (LEAST(t.submitted_at,y.submitted_at),LEAST(t.on_deck_at,y.on_deck_at),LEAST(t.on_hold_at,y.on_hold_at),LEAST(t.passed_at,y.passed_at),LEAST(t.approved_at,y.approved_at),LEAST(t.declined_at,y.declined_at),LEAST(t.excluded_at,y.excluded_at),LEAST(t.last_contact_at,y.last_contact_at))
   RETURNING to_jsonb(t) INTO newj;
  IF FOUND THEN PERFORM public.mcp_lender_audit(p_keep,'deal_lenders',dup.keep_row,oldj,newj,p_source,p_change_reason); END IF;
$x$ || o);
 o := $x$ PERFORM set_config('app.lender_merge_pair','',true);$x$;
 IF position(o in d)=0 THEN RAISE EXCEPTION 'merge anchor 3 missing'; END IF;
 d := replace(d, o, o || E'\n PERFORM set_config(''app.dl_raw_timestamps'','''',true);');
 EXECUTE d;

 -- 2) related writes: id-linked records are validated by id, not stored name text
 d := pg_get_functiondef('public.mcp_write_lender_related(text,text,uuid,uuid,jsonb,boolean,text,text,boolean)'::regprocedure);
 o := $x$IF oldj ? 'lender_name' AND lower$x$;
 IF position(o in d)=0 THEN RAISE EXCEPTION 'related anchor missing'; END IF;
 d := replace(d, o, $x$IF oldj ? 'lender_name' AND NOT (oldj ? 'master_lender_id' OR oldj ? 'lender_id' OR oldj ? 'existing_lender_id') AND lower$x$);
 EXECUTE d;

 -- 3) rename: refresh denormalized names on id-linked directory records
 d := pg_get_functiondef('public.mcp_update_lender'::regproc);
 o := $x$ PERFORM public.mcp_lender_audit(p_lender_id,'master_lenders',p_lender_id,j,afterj,p_source,p_change_reason);$x$;
 IF position(o in d)=0 THEN RAISE EXCEPTION 'update anchor missing'; END IF;
 d := replace(d, o, o || $x$
 IF afterj->>'name' IS DISTINCT FROM j->>'name' THEN
  UPDATE public.lender_notes SET lender_name=afterj->>'name' WHERE master_lender_id=p_lender_id AND lender_name IS DISTINCT FROM afterj->>'name';
  UPDATE public.lender_fit_attributes SET lender_name=afterj->>'name' WHERE master_lender_id=p_lender_id AND lender_name IS DISTINCT FROM afterj->>'name';
  UPDATE public.lender_disqualifications SET lender_name=afterj->>'name' WHERE master_lender_id=p_lender_id AND lender_name IS DISTINCT FROM afterj->>'name';
  UPDATE public.lender_pass_patterns SET lender_name=afterj->>'name' WHERE master_lender_id=p_lender_id AND lender_name IS DISTINCT FROM afterj->>'name';
  UPDATE public.lender_match_rules SET lender_name=afterj->>'name' WHERE lender_id=p_lender_id AND lender_name IS DISTINCT FROM afterj->>'name';
  UPDATE public.lender_sync_requests SET existing_lender_name=afterj->>'name' WHERE existing_lender_id=p_lender_id AND existing_lender_name IS DISTINCT FROM afterj->>'name';
 END IF;$x$);
 EXECUTE d;
END $mig$;