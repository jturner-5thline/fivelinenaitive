CREATE OR REPLACE FUNCTION public.mcp_write_lender_related(p_table text,p_action text,p_lender_id uuid,p_record_id uuid DEFAULT NULL,p_patch jsonb DEFAULT '{}',p_confirm boolean DEFAULT false,p_source text DEFAULT NULL,p_change_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_catalog AS $$
DECLARE l public.master_lenders; oldj jsonb; newj jsonb; fields text; vals text; sets text; k text; rowid uuid; r jsonb; contactcompany uuid; demoted jsonb:='[]';
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_table NOT IN ('lender_contacts','lender_notes','lender_attachments','lender_fit_attributes','lender_disqualifications','lender_doc_flags','funding_source_acquisition_plans','lender_match_rules','lender_pass_detections','lender_pass_patterns','lender_sync_requests','lender_sync_request_decisions','lender_duplicate_dismissals','lender_history_warning_dismissals') THEN RAISE EXCEPTION 'Table is read-only or unsupported'; END IF;
 IF p_action NOT IN ('create','update','delete') OR (p_action='delete' AND p_confirm IS DISTINCT FROM true) THEN RAISE EXCEPTION 'Invalid action or missing confirm:true'; END IF;
 SELECT * INTO l FROM public.master_lenders WHERE id=p_lender_id FOR UPDATE;
 IF NOT FOUND OR NOT public.is_company_member(auth.uid(),l.company_id) THEN RAISE EXCEPTION 'Lender not found or company access denied' USING ERRCODE='42501'; END IF;
 IF p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' THEN RAISE EXCEPTION 'Fields must be an object'; END IF;
 FOR k IN SELECT key FROM jsonb_each(p_patch) LOOP
  IF p_table='lender_attachments' AND p_action='create' AND k IN ('name','file_path','size_bytes','content_type','category') THEN CONTINUE; END IF;
  IF k IN ('id','user_id','company_id','tenant_id','created_at','updated_at','author_user_id','created_by','updated_by','dismissed_by','dismissed_at','disqualified_by','confirmed_by','confirmed_at','processed_by','processed_at','decided_by','decided_at','lender_id','master_lender_id','lender_name','existing_lender_id','existing_lender_name','file_path','size_bytes','embedding','source_hash','model_version','extracted_at','occurrence_count','last_updated') THEN RAISE EXCEPTION 'Server-controlled field: %',k; END IF;
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=p_table AND column_name=k) THEN RAISE EXCEPTION 'Unknown field %.%',p_table,k; END IF;
  IF p_table='lender_attachments' AND k NOT IN ('name','category') THEN RAISE EXCEPTION 'Attachments allow only name and category edits'; END IF;
 END LOOP;
 IF p_action<>'create' THEN
  IF p_record_id IS NULL THEN RAISE EXCEPTION 'record_id required'; END IF;
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 FOR UPDATE',p_table) INTO oldj USING p_record_id;
  IF oldj IS NULL THEN RAISE EXCEPTION 'Record not found or access denied' USING ERRCODE='42501'; END IF;
  IF oldj ? 'lender_id' AND oldj->>'lender_id' IS DISTINCT FROM p_lender_id::text THEN RAISE EXCEPTION 'Record belongs to another lender'; END IF;
  IF oldj ? 'master_lender_id' AND oldj->>'master_lender_id' IS DISTINCT FROM p_lender_id::text THEN RAISE EXCEPTION 'Record is not linked to this lender'; END IF;
  IF oldj ? 'existing_lender_id' AND oldj->>'existing_lender_id' IS DISTINCT FROM p_lender_id::text THEN RAISE EXCEPTION 'Sync request is not linked to this lender'; END IF;
  IF oldj ? 'lender_name' AND lower(oldj->>'lender_name') IS DISTINCT FROM lower(l.name) THEN RAISE EXCEPTION 'Record name does not match lender'; END IF;
  IF oldj ? 'company_id' AND oldj->>'company_id' IS DISTINCT FROM l.company_id::text THEN RAISE EXCEPTION 'Record company does not match lender'; END IF;
  IF oldj ? 'tenant_id' AND oldj->>'tenant_id' IS DISTINCT FROM l.company_id::text THEN RAISE EXCEPTION 'Record tenant does not match lender'; END IF;
 END IF;
 newj:=coalesce(oldj,'{}')||p_patch;
 IF p_table IN ('lender_contacts','lender_match_rules') THEN newj:=newj||jsonb_build_object('lender_id',l.id); END IF;
 IF p_table IN ('lender_notes','lender_fit_attributes','lender_disqualifications','lender_pass_patterns') THEN newj:=newj||jsonb_build_object('master_lender_id',l.id); END IF;
 IF p_table IN ('lender_notes','lender_fit_attributes','lender_disqualifications','lender_doc_flags','lender_match_rules','lender_pass_detections','lender_pass_patterns','lender_history_warning_dismissals') THEN newj:=newj||jsonb_build_object('lender_name',l.name); END IF;
 IF p_table IN ('lender_notes','lender_fit_attributes','lender_doc_flags','lender_duplicate_dismissals','lender_attachments') THEN newj:=newj||jsonb_build_object('company_id',l.company_id); END IF;
 IF p_table='funding_source_acquisition_plans' THEN newj:=newj||jsonb_build_object('tenant_id',l.company_id,'updated_by',auth.uid()); END IF;
 IF p_table='lender_sync_requests' THEN newj:=newj||jsonb_build_object('existing_lender_id',l.id,'existing_lender_name',l.name,'processed_by',auth.uid(),'processed_at',now()); END IF;
 IF p_table='lender_attachments' AND p_action='create' THEN
  IF newj->>'file_path' NOT LIKE auth.uid()::text||'/%' OR newj->>'file_path' LIKE '%..%' OR coalesce((newj->>'size_bytes')::bigint,0) NOT BETWEEN 1 AND 20971520 THEN RAISE EXCEPTION 'Invalid attachment path or file size'; END IF;
  newj:=newj||jsonb_build_object('user_id',auth.uid(),'lender_name',l.name);
 END IF;
 IF p_action='create' AND p_table='lender_notes' THEN newj:=newj||jsonb_build_object('author_user_id',auth.uid()); END IF;
 IF p_action='create' AND p_table IN ('lender_duplicate_dismissals','lender_match_rules') THEN newj:=newj||jsonb_build_object('created_by',auth.uid()); END IF;
 IF p_table='lender_doc_flags' THEN newj:=newj||jsonb_build_object('updated_by',auth.uid()); END IF;
 IF p_action='create' AND p_table='lender_disqualifications' THEN newj:=newj||jsonb_build_object('disqualified_by',auth.uid()); END IF;
 IF p_action='create' AND p_table='lender_history_warning_dismissals' THEN newj:=newj||jsonb_build_object('dismissed_by',auth.uid()); END IF;
 IF p_table='lender_sync_request_decisions' THEN
  SELECT to_jsonb(t) INTO r FROM public.lender_sync_requests t WHERE id=(newj->>'request_id')::uuid;
  IF r IS NULL OR r->>'existing_lender_id' IS DISTINCT FROM l.id::text THEN RAISE EXCEPTION 'Request must be accessible and linked to this lender' USING ERRCODE='42501'; END IF;
  newj:=newj||jsonb_build_object('decided_by',auth.uid(),'decided_at',now());
 END IF;
 IF newj ? 'deal_id' THEN IF NOT EXISTS(SELECT 1 FROM public.deals d WHERE d.id=(newj->>'deal_id')::uuid AND d.company_id=l.company_id) THEN RAISE EXCEPTION 'Deal must belong to lender company and be accessible' USING ERRCODE='42501'; END IF; END IF;
 IF newj->>'deal_lender_id' IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.deal_lenders dl JOIN public.deals d ON d.id=dl.deal_id WHERE dl.id=(newj->>'deal_lender_id')::uuid AND dl.master_lender_id=l.id AND dl.deal_id=(newj->>'deal_id')::uuid AND d.company_id=l.company_id) THEN RAISE EXCEPTION 'deal_lender_id must match lender and deal' USING ERRCODE='42501'; END IF;
 END IF;
 IF p_table='lender_contacts' AND newj->>'contact_id' IS NOT NULL THEN
  SELECT company_id INTO contactcompany FROM public.contacts WHERE id=(newj->>'contact_id')::uuid;
  IF contactcompany IS DISTINCT FROM l.company_id THEN RAISE EXCEPTION 'CRM contact must belong to lender company' USING ERRCODE='42501'; END IF;
 END IF;
 IF p_table='lender_duplicate_dismissals' THEN
  IF NOT (newj->'lender_ids') @> to_jsonb(ARRAY[l.id]) THEN RAISE EXCEPTION 'lender_ids must include the target lender'; END IF;
  FOR k IN SELECT jsonb_array_elements_text(newj->'lender_ids') LOOP IF NOT EXISTS(SELECT 1 FROM public.master_lenders x WHERE x.id=k::uuid AND x.company_id=l.company_id) THEN RAISE EXCEPTION 'All duplicate lender IDs must be in the same company' USING ERRCODE='42501'; END IF; END LOOP;
 END IF;
 IF p_table='lender_pass_detections' AND p_patch ? 'status' THEN
  IF newj->>'status'='confirmed' THEN newj:=newj||jsonb_build_object('confirmed_by',auth.uid(),'confirmed_at',now()); END IF;
  IF newj->>'status'='dismissed' THEN newj:=newj||jsonb_build_object('dismissed_by',auth.uid(),'dismissed_at',now()); END IF;
 END IF;
 IF p_table='lender_notes' AND (length(newj->>'body')>20000 OR coalesce(length(newj->>'body'),0)=0) THEN RAISE EXCEPTION 'Note body requires 1 to 20000 characters'; END IF;
 IF p_action='update' AND p_patch='{}' THEN RAISE EXCEPTION 'No editable fields supplied'; END IF;
 IF p_table='lender_contacts' AND p_patch ? 'contact_id' THEN PERFORM set_config('app.mcp_explicit_crm_link','true',true); END IF;
 IF p_action='create' THEN
  SELECT string_agg(format('%I',key),', '),string_agg(format('r.%I',key),', ') INTO fields,vals FROM jsonb_each(newj);
  EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) r RETURNING to_jsonb(%I)',p_table,fields,vals,p_table,p_table) INTO newj USING newj;
 ELSIF p_action='update' THEN
  SELECT string_agg(format('%I=r.%I',key,key),', ') INTO sets FROM jsonb_each(newj) WHERE key NOT IN ('id','created_at','updated_at');
  EXECUTE format('UPDATE public.%I t SET %s FROM jsonb_populate_record(NULL::public.%I,$1) r WHERE t.id=$2 RETURNING to_jsonb(t)',p_table,sets,p_table) INTO newj USING newj,p_record_id;
 ELSE
  EXECUTE format('DELETE FROM public.%I t WHERE id=$1 RETURNING to_jsonb(t)',p_table) INTO r USING p_record_id;
  IF r IS NULL THEN RAISE EXCEPTION 'Delete denied by existing row-level permissions' USING ERRCODE='42501'; END IF;
  newj:=NULL;
 END IF;
 IF p_action<>'delete' AND newj IS NULL THEN RAISE EXCEPTION 'Write denied by existing row-level permissions' USING ERRCODE='42501'; END IF;
 rowid:=coalesce((newj->>'id')::uuid,p_record_id);
 IF p_table='lender_notes' AND p_action<>'create' THEN INSERT INTO public.lender_master_note_history(note_id,lender_id,user_id,old_record,new_record,source,change_reason) VALUES(rowid,l.id,auth.uid(),oldj,newj,p_source,p_change_reason); END IF;
 PERFORM public.mcp_lender_audit(l.id,p_table,rowid,oldj,newj,p_source,p_change_reason);
 IF p_table='lender_contacts' AND newj->>'is_primary'='true' THEN
  FOR r IN SELECT to_jsonb(c) FROM public.lender_contacts c WHERE c.lender_id=l.id AND c.id<>rowid AND c.is_primary FOR UPDATE LOOP
   UPDATE public.lender_contacts SET is_primary=false WHERE id=(r->>'id')::uuid RETURNING to_jsonb(lender_contacts) INTO oldj;
   IF oldj IS NULL THEN RAISE EXCEPTION 'Cannot demote existing primary contact' USING ERRCODE='42501'; END IF;
   PERFORM public.mcp_lender_audit(l.id,'lender_contacts',(r->>'id')::uuid,r,oldj,p_source,p_change_reason);
   demoted:=demoted||jsonb_build_array(r->>'id');
  END LOOP;
 END IF;
 PERFORM set_config('app.mcp_explicit_crm_link','false',true);
 RETURN jsonb_build_object('record',newj,'deleted',p_action='delete','record_id',rowid,'demoted_primary_contact_ids',demoted);
END $$;
REVOKE ALL ON FUNCTION public.mcp_write_lender_related(text,text,uuid,uuid,jsonb,boolean,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mcp_write_lender_related(text,text,uuid,uuid,jsonb,boolean,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.mcp_lender_has_deals(p_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.master_lenders l WHERE l.id=p_id AND public.is_company_member(auth.uid(),l.company_id)) THEN RAISE EXCEPTION 'Company access denied' USING ERRCODE='42501'; END IF;
 RETURN EXISTS(SELECT 1 FROM public.deal_lenders WHERE master_lender_id=p_id) OR EXISTS(SELECT 1 FROM public.deals WHERE current_lender_id=p_id);
END $$;
REVOKE ALL ON FUNCTION public.mcp_lender_has_deals(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mcp_lender_has_deals(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.mcp_archive_lender(p_lender_id uuid,p_confirm boolean,p_force boolean DEFAULT false,p_source text DEFAULT NULL,p_change_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_catalog AS $$
DECLARE l public.master_lenders;
BEGIN
 IF p_confirm IS DISTINCT FROM true THEN RAISE EXCEPTION 'confirm:true required'; END IF;
 SELECT * INTO l FROM public.master_lenders WHERE id=p_lender_id FOR UPDATE;
 IF auth.uid() IS NULL OR l.id IS NULL OR NOT public.is_company_member(auth.uid(),l.company_id) OR NOT (l.user_id=auth.uid() OR public.can_delete_lenders(auth.uid())) THEN RAISE EXCEPTION 'Lender deletion permission denied' USING ERRCODE='42501'; END IF;
 IF public.mcp_lender_has_deals(l.id) AND p_force IS DISTINCT FROM true THEN RAISE EXCEPTION 'Lender is attached to deals; use force:true to archive without deleting deal links'; END IF;
 RETURN public.mcp_update_lender(l.id,'{"active":false}','replace',NULL,false,p_source,p_change_reason)||jsonb_build_object('archived',true,'hard_deleted',false,'related_rows_preserved',true);
END $$;
REVOKE ALL ON FUNCTION public.mcp_archive_lender(uuid,boolean,boolean,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mcp_archive_lender(uuid,boolean,boolean,text,text) TO authenticated;