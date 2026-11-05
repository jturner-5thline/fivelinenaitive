CREATE OR REPLACE FUNCTION public.mcp_transfer_lender_audit(p_keep uuid,p_merge uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE a public.master_lenders; b public.master_lenders; ref record; hasrows boolean;
BEGIN
 SELECT * INTO a FROM public.master_lenders WHERE id=p_keep;
 SELECT * INTO b FROM public.master_lenders WHERE id=p_merge;
 IF auth.uid() IS NULL OR a.id IS NULL OR b.id IS NULL OR a.company_id IS DISTINCT FROM b.company_id OR NOT public.is_company_member(auth.uid(),a.company_id) OR NOT public.can_delete_lenders(auth.uid()) THEN RAISE EXCEPTION 'Merge permission denied' USING ERRCODE='42501'; END IF;
 FOR ref IN SELECT c.conrelid::regclass rel,att.attname col FROM pg_constraint c JOIN pg_attribute att ON att.attrelid=c.conrelid AND att.attnum=c.conkey[1] WHERE c.confrelid='public.master_lenders'::regclass AND c.contype='f' AND c.conrelid<>'public.lender_audit_logs'::regclass LOOP
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s WHERE %I=$1)',ref.rel,ref.col) INTO hasrows USING p_merge;
  IF hasrows THEN RAISE EXCEPTION 'Merge blocked: related rows remain in % (permissions or conflicting records). No records were merged.',ref.rel; END IF;
 END LOOP;
 UPDATE public.lender_master_note_history SET lender_id=p_keep WHERE lender_id=p_merge;
 UPDATE public.lender_audit_logs SET lender_id=p_keep, metadata=coalesce(metadata,'{}')||jsonb_build_object('original_lender_id',p_merge,'original_lender_name',b.name) WHERE lender_id=p_merge;
END $$;
REVOKE ALL ON FUNCTION public.mcp_transfer_lender_audit(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mcp_transfer_lender_audit(uuid,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.mcp_merge_lenders(p_keep uuid,p_merge uuid,p_confirm boolean,p_source text DEFAULT NULL,p_change_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_catalog AS $$
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
 PERFORM public.mcp_transfer_lender_audit(p_keep,p_merge);
 DELETE FROM public.master_lenders WHERE id=p_merge;
 GET DIAGNOSTICS cnt=ROW_COUNT;
 IF cnt<>1 THEN RAISE EXCEPTION 'Merge delete permission denied' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('merged',true,'keep_lender_id',p_keep,'removed_lender_id',p_merge);
END $$;
REVOKE ALL ON FUNCTION public.mcp_merge_lenders(uuid,uuid,boolean,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mcp_merge_lenders(uuid,uuid,boolean,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.mcp_create_lender(p_patch jsonb,p_source text DEFAULT NULL,p_change_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_catalog AS $$
DECLARE k text; company uuid; l public.master_lenders; rowj jsonb; fields text; vals text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT company_id INTO company FROM public.company_members WHERE user_id=auth.uid() ORDER BY company_id LIMIT 1;
 IF company IS NULL THEN RAISE EXCEPTION 'Caller has no company' USING ERRCODE='42501'; END IF;
 IF p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' THEN RAISE EXCEPTION 'Fields must be an object'; END IF;
 FOR k IN SELECT key FROM jsonb_each(p_patch) LOOP
  IF k IN ('id','user_id','company_id','created_at','updated_at') OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='master_lenders' AND column_name=k) THEN RAISE EXCEPTION 'Immutable or unknown field: %',k; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.master_lenders WHERE company_id=company AND lower(btrim(name))=lower(btrim(p_patch->>'name'))) THEN RAISE EXCEPTION 'Duplicate funding source name; use update_lender instead'; END IF;
 rowj:=jsonb_build_object('active',true,'appetite_status','active','sync_source','naitive','tier',NULL)||p_patch||jsonb_build_object('user_id',auth.uid(),'company_id',company);
 SELECT string_agg(format('%I',key),', '),string_agg(format('r.%I',key),', ') INTO fields,vals FROM jsonb_each(rowj);
 EXECUTE format('INSERT INTO public.master_lenders (%s) SELECT %s FROM jsonb_populate_record(NULL::public.master_lenders,$1) r RETURNING *',fields,vals) INTO l USING rowj;
 IF l.id IS NULL THEN RAISE EXCEPTION 'Create permission denied' USING ERRCODE='42501'; END IF;
 PERFORM public.mcp_update_lender(l.id,p_patch,'replace',NULL,true,p_source,p_change_reason);
 PERFORM public.mcp_lender_audit(l.id,'master_lenders',l.id,NULL,to_jsonb(l),p_source,p_change_reason);
 RETURN jsonb_build_object('lender',to_jsonb(l),'created',true);
END $$;
REVOKE ALL ON FUNCTION public.mcp_create_lender(jsonb,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mcp_create_lender(jsonb,text,text) TO authenticated;