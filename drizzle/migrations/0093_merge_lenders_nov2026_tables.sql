ALTER TABLE public.lender_performance_history ADD COLUMN IF NOT EXISTS merged_from uuid;

-- Allow lender_id reassignment on the two new tables only inside an explicit merge context.
CREATE OR REPLACE FUNCTION public.lender_deal_history_prepare()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.company_id IS NULL THEN
      SELECT ml.company_id INTO NEW.company_id FROM public.master_lenders ml WHERE ml.id = NEW.lender_id;
    END IF;
  ELSE
    NEW.company_id := OLD.company_id;
    IF coalesce(current_setting('app.lender_merge_pair', true), '') <> NEW.lender_id::text || ':' || OLD.lender_id::text THEN
      NEW.lender_id := OLD.lender_id;
    END IF;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := now();
  END IF;
  NEW.borrower_name := btrim(NEW.borrower_name);
  NEW.dedupe_key := lower(NEW.lender_id::text || '|' || NEW.borrower_name || '|' || coalesce(to_char(NEW.announced_on, 'YYYY-MM'), ''));
  IF NEW.status = 'confirmed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'confirmed') THEN
    NEW.confirmed_by := auth.uid();
    NEW.confirmed_at := now();
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.lender_intro_paths_prepare()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT ml.company_id INTO NEW.company_id FROM public.master_lenders ml WHERE ml.id = NEW.lender_id;
  ELSE
    NEW.company_id := OLD.company_id;
    IF coalesce(current_setting('app.lender_merge_pair', true), '') <> NEW.lender_id::text || ':' || OLD.lender_id::text THEN
      NEW.lender_id := OLD.lender_id;
    END IF;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
  END IF;
  NEW.from_name := nullif(btrim(NEW.from_name), '');
  NEW.dedupe_key := lower(NEW.lender_id::text || '|' || coalesce(NEW.lender_contact_id::text, '') || '|' ||
    coalesce(NEW.from_contact_id::text, NEW.from_user_id::text, NEW.from_referral_source_id::text, NEW.from_name, '') || '|' || NEW.path_type);
  RETURN NEW;
END $function$;

-- Definer helper: moves Nov 2026 lender tables. Only runs inside mcp_merge_lenders' merge context.
CREATE OR REPLACE FUNCTION private.merge_lender_new_tables(p_keep uuid, p_merge uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_catalog'
AS $fn$
DECLARE a public.master_lenders; b public.master_lenders; res jsonb := '{}'; n int;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_delete_lenders(auth.uid()) THEN RAISE EXCEPTION 'Lender merge requires existing lender deletion permission' USING ERRCODE='42501'; END IF;
  IF coalesce(current_setting('app.lender_merge_pair', true), '') <> p_keep::text || ':' || p_merge::text THEN RAISE EXCEPTION 'Only callable inside an explicit lender merge' USING ERRCODE='42501'; END IF;
  SELECT * INTO a FROM public.master_lenders WHERE id = p_keep;
  SELECT * INTO b FROM public.master_lenders WHERE id = p_merge;
  IF a.id IS NULL OR b.id IS NULL OR a.company_id IS DISTINCT FROM b.company_id OR NOT public.is_company_member(auth.uid(), a.company_id) THEN RAISE EXCEPTION 'Both lenders must be accessible in the same company' USING ERRCODE='42501'; END IF;

  -- lender_engagements
  DELETE FROM public.lender_engagements m WHERE m.lender_id = p_merge AND m.external_ref IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.lender_engagements k WHERE k.lender_id = p_keep AND k.source = m.source AND k.external_ref = m.external_ref);
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('lender_engagements_dropped', n);
  UPDATE public.lender_engagements SET lender_id = p_keep,
    crm_company_id = CASE WHEN crm_company_id IS NULL OR crm_company_id = b.crm_company_id THEN coalesce(a.crm_company_id, crm_company_id) ELSE crm_company_id END
   WHERE lender_id = p_merge;
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('lender_engagements_moved', n);

  -- lender_deal_history (dedupe on recomputed key)
  DELETE FROM public.lender_deal_history m WHERE m.lender_id = p_merge AND EXISTS (SELECT 1 FROM public.lender_deal_history k WHERE k.dedupe_key = lower(p_keep::text || '|' || m.borrower_name || '|' || coalesce(to_char(m.announced_on,'YYYY-MM'),'')));
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('lender_deal_history_dropped', n);
  UPDATE public.lender_deal_history SET lender_id = p_keep WHERE lender_id = p_merge;
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('lender_deal_history_moved', n);

  -- lender_intro_paths
  DELETE FROM public.lender_intro_paths m WHERE m.lender_id = p_merge AND EXISTS (SELECT 1 FROM public.lender_intro_paths k WHERE k.dedupe_key = lower(p_keep::text || '|' || coalesce(m.lender_contact_id::text,'') || '|' || coalesce(m.from_contact_id::text, m.from_user_id::text, m.from_referral_source_id::text, m.from_name, '') || '|' || m.path_type));
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('lender_intro_paths_dropped', n);
  UPDATE public.lender_intro_paths SET lender_id = p_keep WHERE lender_id = p_merge;
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('lender_intro_paths_moved', n);

  -- deal_lender_stage_events (deal_lender_id re-pointing for duplicate deal links is done by the caller first)
  UPDATE public.deal_lender_stage_events SET master_lender_id = p_keep WHERE master_lender_id = p_merge;
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('deal_lender_stage_events_moved', n);

  -- crm_company_team owners via linked CRM companies
  IF a.crm_company_id IS NOT NULL AND b.crm_company_id IS NOT NULL AND a.crm_company_id <> b.crm_company_id THEN
    DELETE FROM public.crm_company_team m WHERE m.crm_company_id = b.crm_company_id AND EXISTS (SELECT 1 FROM public.crm_company_team k WHERE k.crm_company_id = a.crm_company_id AND k.user_id = m.user_id);
    GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('crm_company_team_dropped', n);
    UPDATE public.crm_company_team SET crm_company_id = a.crm_company_id WHERE crm_company_id = b.crm_company_id;
    GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('crm_company_team_moved', n);
  END IF;

  -- performance: drop merged current score, move history with provenance
  DELETE FROM public.lender_performance_scores WHERE lender_id = p_merge;
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('lender_performance_scores_dropped', n);
  UPDATE public.lender_performance_history SET lender_id = p_keep, merged_from = p_merge WHERE lender_id = p_merge;
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('lender_performance_history_moved', n);
  RETURN res;
END $fn$;
REVOKE ALL ON FUNCTION private.merge_lender_new_tables(uuid,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION private.merge_lender_new_tables(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mcp_merge_lenders(p_keep uuid, p_merge uuid, p_confirm boolean, p_source text DEFAULT NULL::text, p_change_reason text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE a public.master_lenders; b public.master_lenders; oldj jsonb; newj jsonb; r jsonb; patch jsonb:='{}'; k text; tbl text; col text; cnt int;
 dup record; extra text; dups jsonb := '[]'; newres jsonb;
BEGIN
 IF p_confirm IS DISTINCT FROM true OR p_keep=p_merge THEN RAISE EXCEPTION 'confirm:true and two different lenders required'; END IF;
 IF auth.uid() IS NULL OR NOT public.can_delete_lenders(auth.uid()) THEN RAISE EXCEPTION 'Lender merge requires existing lender deletion permission' USING ERRCODE='42501'; END IF;
 PERFORM id FROM public.master_lenders WHERE id IN (p_keep,p_merge) ORDER BY id FOR UPDATE;
 SELECT * INTO a FROM public.master_lenders WHERE id=p_keep;
 SELECT * INTO b FROM public.master_lenders WHERE id=p_merge;
 IF a.id IS NULL OR b.id IS NULL OR a.company_id IS DISTINCT FROM b.company_id OR NOT public.is_company_member(auth.uid(),a.company_id) THEN RAISE EXCEPTION 'Both lenders must be accessible in the same company' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.lender_contacts WHERE lender_id=p_keep AND is_primary) AND EXISTS(SELECT 1 FROM public.lender_contacts WHERE lender_id=p_merge AND is_primary) THEN RAISE EXCEPTION 'Both lenders have primary contacts; demote one before merging.'; END IF;
 PERFORM set_config('app.lender_merge_pair',p_keep::text||':'||p_merge::text,true);

 -- Duplicate deal links: keep the kept row, append merged pass_reason/notes, re-point stage events, remove merged row.
 FOR dup IN SELECT x.id AS keep_row, y.id AS merge_row, x.deal_id, x.notes AS kn, x.pass_reason AS kp, y.notes AS mn, y.pass_reason AS mp
   FROM public.deal_lenders x JOIN public.deal_lenders y ON x.deal_id=y.deal_id
   WHERE x.master_lender_id=p_keep AND y.master_lender_id=p_merge FOR UPDATE OF x, y LOOP
  oldj := (SELECT to_jsonb(t) FROM public.deal_lenders t WHERE id=dup.keep_row);
  IF nullif(btrim(coalesce(dup.mp,'')),'') IS NOT NULL OR nullif(btrim(coalesce(dup.mn,'')),'') IS NOT NULL THEN
   UPDATE public.deal_lenders t SET
     pass_reason = CASE WHEN nullif(btrim(coalesce(dup.mp,'')),'') IS NULL THEN t.pass_reason
                        WHEN nullif(btrim(coalesce(t.pass_reason,'')),'') IS NULL THEN 'From merged record: '||dup.mp
                        ELSE t.pass_reason||E'\n\nFrom merged record: '||dup.mp END,
     notes = CASE WHEN nullif(btrim(coalesce(dup.mn,'')),'') IS NULL THEN t.notes
                  WHEN nullif(btrim(coalesce(t.notes,'')),'') IS NULL THEN 'From merged record: '||dup.mn
                  ELSE t.notes||E'\n\nFrom merged record: '||dup.mn END
    WHERE id=dup.keep_row RETURNING to_jsonb(t) INTO newj;
   IF newj IS NULL THEN RAISE EXCEPTION 'Merge blocked by deal_lenders update permissions; no data changed' USING ERRCODE='42501'; END IF;
   PERFORM public.mcp_lender_audit(p_keep,'deal_lenders',dup.keep_row,oldj,newj,p_source,p_change_reason);
  END IF;
  UPDATE public.deal_lender_stage_events SET deal_lender_id = dup.keep_row WHERE deal_lender_id = dup.merge_row;
  oldj := (SELECT to_jsonb(t) FROM public.deal_lenders t WHERE id=dup.merge_row);
  DELETE FROM public.deal_lenders WHERE id=dup.merge_row;
  GET DIAGNOSTICS cnt=ROW_COUNT;
  IF cnt<>1 THEN RAISE EXCEPTION 'Merge blocked by deal_lenders delete permissions; no data changed' USING ERRCODE='42501'; END IF;
  PERFORM public.mcp_lender_audit(p_keep,'deal_lenders',dup.merge_row,oldj,NULL,p_source,p_change_reason);
  dups := dups || jsonb_build_object('deal_id',dup.deal_id,'kept_deal_lender_id',dup.keep_row,'removed_deal_lender_id',dup.merge_row);
 END LOOP;

 oldj:=to_jsonb(a); newj:=to_jsonb(b);
 FOR k IN SELECT key FROM jsonb_each(newj) LOOP
  IF k NOT IN ('id','user_id','company_id','name','created_at','updated_at') AND (oldj->k='null' OR oldj->k='""' OR oldj->k='[]') AND newj->k<>'null' THEN patch:=patch||jsonb_build_object(k,newj->k); END IF;
 END LOOP;
 IF patch<>'{}' THEN PERFORM public.mcp_update_lender(p_keep,patch,'replace',NULL,false,p_source,p_change_reason); END IF;
 FOR tbl,col IN SELECT * FROM (VALUES ('lender_contacts','lender_id'),('lender_notes','master_lender_id'),('lender_fit_attributes','master_lender_id'),('lender_pass_patterns','master_lender_id'),('lender_disqualifications','master_lender_id'),('lender_sync_requests','existing_lender_id'),('lender_match_rules','lender_id'),('deal_lenders','master_lender_id'),('deals','current_lender_id')) v LOOP
  FOR r IN EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE %I=$1 FOR UPDATE',tbl,col) USING p_merge LOOP
   EXECUTE format('UPDATE public.%I t SET %I=$1%s WHERE id=$2 RETURNING to_jsonb(t)',tbl,col,CASE WHEN r ? 'lender_name' THEN ', lender_name=$3' WHEN r ? 'existing_lender_name' THEN ', existing_lender_name=$3' WHEN tbl='deal_lenders' THEN ', name=$3' ELSE '' END) INTO newj USING p_keep,(r->>'id')::uuid,a.name;
   IF newj IS NULL THEN RAISE EXCEPTION 'Merge blocked by % update permissions; no data changed',tbl USING ERRCODE='42501'; END IF;
   PERFORM public.mcp_lender_audit(p_keep,tbl,(r->>'id')::uuid,r,newj,p_source,p_change_reason);
  END LOOP;
 END LOOP;
 FOR tbl IN SELECT unnest(ARRAY['lender_attachments','lender_doc_flags','lender_pass_detections','lender_history_warning_dismissals']) LOOP
  FOR r IN EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE lender_name=$1 %s FOR UPDATE',tbl,CASE WHEN tbl IN ('lender_attachments','lender_doc_flags') THEN 'AND company_id=$2' ELSE 'AND deal_id IN (SELECT id FROM public.deals WHERE company_id=$2)' END) USING b.name,b.company_id LOOP
   EXECUTE format('UPDATE public.%I t SET lender_name=$1 WHERE id=$2 RETURNING to_jsonb(t)',tbl) INTO newj USING a.name,(r->>'id')::uuid;
   IF newj IS NULL THEN RAISE EXCEPTION 'Merge blocked by % update permissions',tbl USING ERRCODE='42501'; END IF;
   PERFORM public.mcp_lender_audit(p_keep,tbl,(r->>'id')::uuid,r,newj,p_source,p_change_reason);
  END LOOP;
 END LOOP;
 newres := private.merge_lender_new_tables(p_keep, p_merge);
 PERFORM public.mcp_lender_audit(p_keep,'master_lenders',p_merge,to_jsonb(b),NULL,p_source,p_change_reason);
 PERFORM public.mcp_transfer_lender_audit(p_keep,p_merge);
 PERFORM set_config('app.lender_merge_pair','',true);
 DELETE FROM public.master_lenders WHERE id=p_merge;
 GET DIAGNOSTICS cnt=ROW_COUNT;
 IF cnt<>1 THEN RAISE EXCEPTION 'Merge delete permission denied' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('merged',true,'keep_lender_id',p_keep,'removed_lender_id',p_merge,'duplicate_deal_links_resolved',dups,'new_tables',newres);
END $function$;

CREATE OR REPLACE FUNCTION public.mcp_merge_lenders_preview(p_keep uuid, p_merge uuid)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE a public.master_lenders; b public.master_lenders; fill jsonb := '{}'; k text; moves jsonb := '{}'; drops jsonb := '{}'; unreadable jsonb := '[]'; tbl text; col text; cnt int; blocking text := NULL;
 dups jsonb; score jsonb; hist int; mv int; dr int;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM public.master_lenders WHERE id=p_keep;
 SELECT * INTO b FROM public.master_lenders WHERE id=p_merge;
 IF a.id IS NULL OR b.id IS NULL THEN RAISE EXCEPTION 'Both lenders must be visible to you' USING ERRCODE='42501'; END IF;
 FOR k IN SELECT key FROM jsonb_each(to_jsonb(b)) LOOP
  IF k NOT IN ('id','user_id','company_id','name','created_at','updated_at') AND (to_jsonb(a)->k='null' OR to_jsonb(a)->k='""' OR to_jsonb(a)->k='[]') AND to_jsonb(b)->k<>'null' THEN fill := fill || jsonb_build_object(k, to_jsonb(b)->k); END IF;
 END LOOP;

 SELECT coalesce(jsonb_agg(jsonb_build_object('deal_id',x.deal_id,'deal_name',d.company,'kept_deal_lender_id',x.id,'kept_stage',x.stage,'merged_deal_lender_id',y.id,'merged_stage',y.stage,
   'merged_pass_reason',y.pass_reason,'merged_notes',y.notes,
   'resolution','Keep kept lender''s deal link; append merged pass_reason/notes prefixed "From merged record:"; re-point its stage events; remove merged deal link')),'[]')
  INTO dups FROM public.deal_lenders x JOIN public.deal_lenders y ON x.deal_id=y.deal_id LEFT JOIN public.deals d ON d.id=x.deal_id
  WHERE x.master_lender_id=p_keep AND y.master_lender_id=p_merge;

 FOR tbl,col IN SELECT * FROM (VALUES ('lender_contacts','lender_id'),('lender_notes','master_lender_id'),('lender_fit_attributes','master_lender_id'),('lender_pass_patterns','master_lender_id'),('lender_disqualifications','master_lender_id'),('lender_sync_requests','existing_lender_id'),('lender_match_rules','lender_id'),('deals','current_lender_id')) v LOOP
  BEGIN
   EXECUTE format('SELECT count(*) FROM public.%I WHERE %I=$1', tbl, col) INTO cnt USING p_merge;
   IF cnt > 0 THEN moves := moves || jsonb_build_object(tbl, cnt); END IF;
  EXCEPTION WHEN OTHERS THEN unreadable := unreadable || jsonb_build_object('table', tbl, 'error', SQLERRM);
  END;
 END LOOP;
 SELECT count(*) INTO cnt FROM public.deal_lenders WHERE master_lender_id=p_merge;
 IF cnt - jsonb_array_length(dups) > 0 THEN moves := moves || jsonb_build_object('deal_lenders', cnt - jsonb_array_length(dups)); END IF;
 IF jsonb_array_length(dups) > 0 THEN drops := drops || jsonb_build_object('deal_lenders (duplicate deal links, merged into kept row)', jsonb_array_length(dups)); END IF;
 FOR tbl IN SELECT unnest(ARRAY['lender_attachments','lender_doc_flags']) LOOP
  BEGIN
   EXECUTE format('SELECT count(*) FROM public.%I WHERE lender_name=$1 AND company_id=$2', tbl) INTO cnt USING b.name, b.company_id;
   IF cnt > 0 THEN moves := moves || jsonb_build_object(tbl, cnt); END IF;
  EXCEPTION WHEN OTHERS THEN unreadable := unreadable || jsonb_build_object('table', tbl, 'error', SQLERRM);
  END;
 END LOOP;

 SELECT count(*) FILTER (WHERE NOT ex), count(*) FILTER (WHERE ex) INTO mv, dr FROM (SELECT m.external_ref IS NOT NULL AND EXISTS (SELECT 1 FROM public.lender_engagements k WHERE k.lender_id=p_keep AND k.source=m.source AND k.external_ref=m.external_ref) ex FROM public.lender_engagements m WHERE m.lender_id=p_merge) s;
 moves := moves || jsonb_build_object('lender_engagements', mv); drops := drops || jsonb_build_object('lender_engagements (same source+external_ref on kept)', dr);
 SELECT count(*) FILTER (WHERE NOT ex), count(*) FILTER (WHERE ex) INTO mv, dr FROM (SELECT EXISTS (SELECT 1 FROM public.lender_deal_history k WHERE k.dedupe_key = lower(p_keep::text||'|'||m.borrower_name||'|'||coalesce(to_char(m.announced_on,'YYYY-MM'),''))) ex FROM public.lender_deal_history m WHERE m.lender_id=p_merge) s;
 moves := moves || jsonb_build_object('lender_deal_history', mv); drops := drops || jsonb_build_object('lender_deal_history (same borrower+month on kept)', dr);
 SELECT count(*) FILTER (WHERE NOT ex), count(*) FILTER (WHERE ex) INTO mv, dr FROM (SELECT EXISTS (SELECT 1 FROM public.lender_intro_paths k WHERE k.dedupe_key = lower(p_keep::text||'|'||coalesce(m.lender_contact_id::text,'')||'|'||coalesce(m.from_contact_id::text,m.from_user_id::text,m.from_referral_source_id::text,m.from_name,'')||'|'||m.path_type)) ex FROM public.lender_intro_paths m WHERE m.lender_id=p_merge) s;
 moves := moves || jsonb_build_object('lender_intro_paths', mv); drops := drops || jsonb_build_object('lender_intro_paths (same introducer+type on kept)', dr);
 SELECT count(*) INTO cnt FROM public.deal_lender_stage_events WHERE master_lender_id=p_merge;
 moves := moves || jsonb_build_object('deal_lender_stage_events', cnt);
 IF a.crm_company_id IS NOT NULL AND b.crm_company_id IS NOT NULL AND a.crm_company_id <> b.crm_company_id THEN
  SELECT count(*) FILTER (WHERE NOT ex), count(*) FILTER (WHERE ex) INTO mv, dr FROM (SELECT EXISTS (SELECT 1 FROM public.crm_company_team k WHERE k.crm_company_id=a.crm_company_id AND k.user_id=m.user_id) ex FROM public.crm_company_team m WHERE m.crm_company_id=b.crm_company_id) s;
  moves := moves || jsonb_build_object('crm_company_team', mv); drops := drops || jsonb_build_object('crm_company_team (owner already on kept company)', dr);
 ELSE
  moves := moves || jsonb_build_object('crm_company_team', 0);
 END IF;
 SELECT count(*) INTO hist FROM public.lender_performance_history WHERE lender_id=p_merge;
 SELECT jsonb_build_object('merged_score_row', (SELECT jsonb_build_object('overall_label',overall_label,'computed_at',computed_at) FROM public.lender_performance_scores WHERE lender_id=p_merge),
   'kept_score_row', (SELECT jsonb_build_object('overall_label',overall_label,'computed_at',computed_at) FROM public.lender_performance_scores WHERE lender_id=p_keep),
   'action', 'Delete merged lender''s current score (next scoring run recomputes the kept lender); keep kept lender''s score unchanged',
   'history_rows_moved', hist, 'history_action', 'Move history rows to kept lender with merged_from = '||p_merge::text) INTO score;
 SELECT count(*) INTO cnt FROM public.lender_performance_scores WHERE lender_id=p_merge;
 drops := drops || jsonb_build_object('lender_performance_scores', cnt);
 moves := moves || jsonb_build_object('lender_performance_history', hist);

 BEGIN
  PERFORM public.mcp_merge_lenders(p_keep, p_merge, true, 'dry_run', NULL);
  RAISE EXCEPTION USING ERRCODE='P0D01', MESSAGE='dry run rollback';
 EXCEPTION
  WHEN SQLSTATE 'P0D01' THEN NULL;
  WHEN OTHERS THEN blocking := SQLERRM;
 END;
 IF blocking IS NULL AND unreadable <> '[]' THEN blocking := 'Related tables not readable: ' || unreadable::text; END IF;
 RETURN jsonb_build_object('dry_run', true, 'keep_lender', jsonb_build_object('id',a.id,'name',a.name), 'merge_lender', jsonb_build_object('id',b.id,'name',b.name),
  'fields_filled_on_keep', fill, 'children_to_move', moves, 'children_to_drop', drops, 'duplicate_deal_links', dups, 'performance_score_handling', score,
  'tables_not_readable', unreadable, 'can_merge', blocking IS NULL, 'blocking_conflict', blocking);
END $function$;