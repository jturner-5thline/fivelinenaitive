CREATE OR REPLACE FUNCTION public.mcp_transfer_lender_audit(p_keep uuid, p_merge uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE a public.master_lenders; b public.master_lenders; ref record; hasrows boolean;
BEGIN
 IF coalesce(current_setting('app.lender_merge_pair',true),'') IS DISTINCT FROM p_keep::text||':'||p_merge::text THEN RAISE EXCEPTION 'Audit history can only move as part of a lender merge' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM public.master_lenders WHERE id=p_keep;
 SELECT * INTO b FROM public.master_lenders WHERE id=p_merge;
 IF auth.uid() IS NULL OR a.id IS NULL OR b.id IS NULL OR a.company_id IS DISTINCT FROM b.company_id OR NOT public.is_company_member(auth.uid(),a.company_id) OR NOT public.can_delete_lenders(auth.uid()) THEN RAISE EXCEPTION 'Merge permission denied' USING ERRCODE='42501'; END IF;
 FOR ref IN SELECT c.conrelid::regclass rel,att.attname col FROM pg_constraint c JOIN pg_attribute att ON att.attrelid=c.conrelid AND att.attnum=c.conkey[1] WHERE c.confrelid='public.master_lenders'::regclass AND c.contype='f' AND c.conrelid<>'public.lender_audit_logs'::regclass LOOP
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s WHERE %I=$1)',ref.rel,ref.col) INTO hasrows USING p_merge;
  IF hasrows THEN RAISE EXCEPTION 'Merge blocked: related rows remain in % (permissions or conflicting records). No records were merged.',ref.rel; END IF;
 END LOOP;
 -- Preserve non-FK references too, including computed analytics and historical operations.
 -- Do not rewrite computed analytics, tasks, queued communications or agent records.
 FOR ref IN SELECT table_name,column_name,udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name NOT IN ('lender_audit_logs','lender_master_note_history') AND ((column_name IN ('lender_id','master_lender_id','funding_source_id') AND udt_name='uuid') OR (column_name='lender_ids' AND udt_name='_uuid')) LOOP
  IF ref.udt_name='_uuid' THEN
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE $1=ANY(%I))',ref.table_name,ref.column_name) INTO hasrows USING p_merge;
  ELSE
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE %I=$1)',ref.table_name,ref.column_name) INTO hasrows USING p_merge;
  END IF;
  IF hasrows THEN RAISE EXCEPTION 'Merge blocked by retained references in %. No data changed; resolve references first.',ref.table_name; END IF;
 END LOOP;
 FOR ref IN SELECT * FROM (VALUES ('lender_attachments'),('lender_doc_flags')) t(table_name) LOOP
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE company_id=$1 AND lower(lender_name)=lower($2))',ref.table_name) INTO hasrows USING b.company_id,b.name;
  IF hasrows THEN RAISE EXCEPTION 'Merge blocked by remaining name-linked records in %; no data changed.',ref.table_name; END IF;
 END LOOP;
 UPDATE public.lender_master_note_history SET lender_id=p_keep WHERE lender_id=p_merge;
 UPDATE public.lender_audit_logs SET lender_id=p_keep, metadata=coalesce(metadata,'{}')||jsonb_build_object('original_lender_id',p_merge,'original_lender_name',b.name) WHERE lender_id=p_merge;
END $function$;

CREATE OR REPLACE FUNCTION public.mcp_merge_lenders(p_keep uuid, p_merge uuid, p_confirm boolean, p_source text DEFAULT NULL::text, p_change_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE a public.master_lenders; b public.master_lenders; oldj jsonb; newj jsonb; r jsonb; patch jsonb:='{}'; k text; tbl text; col text; cnt int;
BEGIN
 IF p_confirm IS DISTINCT FROM true OR p_keep=p_merge THEN RAISE EXCEPTION 'confirm:true and two different lenders required'; END IF;
 IF auth.uid() IS NULL OR NOT public.can_delete_lenders(auth.uid()) THEN RAISE EXCEPTION 'Lender merge requires existing lender deletion permission' USING ERRCODE='42501'; END IF;
 PERFORM id FROM public.master_lenders WHERE id IN (p_keep,p_merge) ORDER BY id FOR UPDATE;
 SELECT * INTO a FROM public.master_lenders WHERE id=p_keep;
 SELECT * INTO b FROM public.master_lenders WHERE id=p_merge;
 IF a.id IS NULL OR b.id IS NULL OR a.company_id IS DISTINCT FROM b.company_id OR NOT public.is_company_member(auth.uid(),a.company_id) THEN RAISE EXCEPTION 'Both lenders must be accessible in the same company' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.deal_lenders x JOIN public.deal_lenders y ON x.deal_id=y.deal_id WHERE x.master_lender_id=p_keep AND y.master_lender_id=p_merge) THEN RAISE EXCEPTION 'Both lenders are on the same deal. Resolve duplicate deal links before merging; no data changed.'; END IF;
 IF EXISTS(SELECT 1 FROM public.lender_contacts WHERE lender_id=p_keep AND is_primary) AND EXISTS(SELECT 1 FROM public.lender_contacts WHERE lender_id=p_merge AND is_primary) THEN RAISE EXCEPTION 'Both lenders have primary contacts; demote one before merging.'; END IF;
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
 PERFORM public.mcp_lender_audit(p_keep,'master_lenders',p_merge,to_jsonb(b),NULL,p_source,p_change_reason);
 PERFORM set_config('app.lender_merge_pair',p_keep::text||':'||p_merge::text,true);
 PERFORM public.mcp_transfer_lender_audit(p_keep,p_merge);
 PERFORM set_config('app.lender_merge_pair','',true);
 DELETE FROM public.master_lenders WHERE id=p_merge;
 GET DIAGNOSTICS cnt=ROW_COUNT;
 IF cnt<>1 THEN RAISE EXCEPTION 'Merge delete permission denied' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('merged',true,'keep_lender_id',p_keep,'removed_lender_id',p_merge);
END $function$;