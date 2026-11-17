-- 1. Field-level audit for MCP edits to CRM contacts and companies (browser read-only history).
CREATE TABLE IF NOT EXISTS public.crm_record_field_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_type text NOT NULL CHECK (record_type IN ('contacts','crm_companies')),
  record_id uuid NOT NULL,
  org_company_id uuid NOT NULL,
  field text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  source text,
  change_reason text,
  actor_user_id uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_record_field_audit_record_idx ON public.crm_record_field_audit (record_type, record_id, created_at DESC);
ALTER TABLE public.crm_record_field_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read CRM field audit" ON public.crm_record_field_audit FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), org_company_id));
CREATE POLICY "Members write own CRM field audit" ON public.crm_record_field_audit FOR INSERT TO authenticated
  WITH CHECK (actor_user_id = auth.uid() AND public.is_company_member(auth.uid(), org_company_id));
REVOKE ALL ON public.crm_record_field_audit FROM anon, public;
GRANT SELECT, INSERT ON public.crm_record_field_audit TO authenticated;
GRANT ALL ON public.crm_record_field_audit TO service_role;

-- 2. Idempotent MCP notes on contacts/companies.
CREATE UNIQUE INDEX IF NOT EXISTS contact_activities_mcp_idem_uidx ON public.contact_activities (contact_id, (metadata->>'mcp_idempotency_key')) WHERE metadata ? 'mcp_idempotency_key';
CREATE UNIQUE INDEX IF NOT EXISTS crm_company_activities_mcp_idem_uidx ON public.crm_company_activities (crm_company_id, (metadata->>'mcp_idempotency_key')) WHERE metadata ? 'mcp_idempotency_key';

-- 3. Caller-scoped partial update of a CRM contact or company with per-field audit.
CREATE OR REPLACE FUNCTION public.mcp_update_crm_record(
  p_table text, p_id uuid, p_patch jsonb, p_mode text DEFAULT 'replace',
  p_expected_updated_at timestamptz DEFAULT NULL, p_dry_run boolean DEFAULT false,
  p_source text DEFAULT NULL, p_change_reason text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public','pg_catalog'
AS $fn$
DECLARE oldj jsonb; newj jsonb; allowed text[]; k text; sets text; diff jsonb := '{}'; org uuid; longtext text[];
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_table = 'contacts' THEN
  allowed := ARRAY['first_name','last_name','email','additional_emails','phone_work','phone_mobile','phone_other','job_title','contact_type','lifecycle_stage','status','lead_source','owner_user_id','linkedin_url','city','state','country','description','tags','crm_company_id','referral_agreement_on_file','w9_on_file','referral_fee','lender_referred_pct'];
  longtext := ARRAY['description'];
 ELSIF p_table = 'crm_companies' THEN
  allowed := ARRAY['name','domain','additional_domains','website_url','company_type','status','owner_user_id','industry','sub_industry','employee_count','employee_range','annual_revenue','revenue_band','hq_city','hq_state','hq_country','hq_postal_code','hq_address','address','regions_served','parent_company_id','customer_tier','segment','lifecycle_stage','description','notes','linkedin_url','twitter_url','phone','main_contact_email','tags','year_founded','financing_status','key_products'];
  longtext := ARRAY['description','notes'];
 ELSE RAISE EXCEPTION 'Unsupported table'; END IF;
 IF p_mode NOT IN ('replace','append','prepend') THEN RAISE EXCEPTION 'mode must be replace, append or prepend'; END IF;
 IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' OR p_patch = '{}' THEN RAISE EXCEPTION 'No fields to update'; END IF;
 FOR k IN SELECT key FROM jsonb_each(p_patch) LOOP
  IF NOT k = ANY(allowed) THEN RAISE EXCEPTION 'Field % is not editable on %', k, p_table; END IF;
 END LOOP;
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 FOR UPDATE', p_table) INTO oldj USING p_id;
 IF oldj IS NULL THEN RAISE EXCEPTION 'Record not found or not visible to this user' USING ERRCODE='42501'; END IF;
 org := (oldj->>'org_company_id')::uuid;
 IF org IS NULL OR NOT public.is_company_member(auth.uid(), org) THEN RAISE EXCEPTION 'Record is outside your workspace' USING ERRCODE='42501'; END IF;
 IF p_expected_updated_at IS NOT NULL AND (oldj->>'updated_at')::timestamptz IS DISTINCT FROM p_expected_updated_at THEN
  RETURN jsonb_build_object('error','conflict','message','Record changed since expected_updated_at; nothing was written.','current',oldj);
 END IF;
 IF p_patch ? 'crm_company_id' AND nullif(p_patch->>'crm_company_id','') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.crm_companies c WHERE c.id=(p_patch->>'crm_company_id')::uuid AND c.org_company_id=org) THEN
  RAISE EXCEPTION 'crm_company_id must be a company in the same workspace' USING ERRCODE='42501'; END IF;
 IF p_patch ? 'parent_company_id' AND nullif(p_patch->>'parent_company_id','') IS NOT NULL AND (p_patch->>'parent_company_id')::uuid = p_id THEN RAISE EXCEPTION 'A company cannot be its own parent'; END IF;
 IF p_patch ? 'parent_company_id' AND nullif(p_patch->>'parent_company_id','') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.crm_companies c WHERE c.id=(p_patch->>'parent_company_id')::uuid AND c.org_company_id=org) THEN
  RAISE EXCEPTION 'parent_company_id must be a company in the same workspace' USING ERRCODE='42501'; END IF;
 newj := p_patch;
 IF p_mode <> 'replace' THEN
  FOR k IN SELECT key FROM jsonb_each(p_patch) LOOP
   IF k = ANY(longtext) AND jsonb_typeof(p_patch->k) = 'string' AND coalesce(oldj->>k,'') <> '' THEN
    newj := newj || jsonb_build_object(k, CASE WHEN p_mode='append' THEN (oldj->>k) || E'\n\n' || (p_patch->>k) ELSE (p_patch->>k) || E'\n\n' || (oldj->>k) END);
   END IF;
  END LOOP;
 END IF;
 IF length(newj->>'description') > 50000 OR length(newj->>'notes') > 50000 THEN RAISE EXCEPTION 'Long text exceeds 50000 characters'; END IF;
 FOR k IN SELECT key FROM jsonb_each(newj) LOOP
  IF (oldj->k) IS DISTINCT FROM (newj->k) THEN diff := diff || jsonb_build_object(k, jsonb_build_object('old', oldj->k, 'new', newj->k)); END IF;
 END LOOP;
 IF p_dry_run THEN RETURN jsonb_build_object('dry_run', true, 'diff', diff, 'current', oldj); END IF;
 IF diff = '{}' THEN RETURN jsonb_build_object('record', oldj, 'diff', diff, 'unchanged', true); END IF;
 newj := newj || jsonb_build_object('last_modified_by', auth.uid());
 SELECT string_agg(format('%I=r.%I', key, key), ', ') INTO sets FROM jsonb_each(newj);
 EXECUTE format('UPDATE public.%I t SET %s FROM jsonb_populate_record(NULL::public.%I, $1) r WHERE t.id=$2 RETURNING to_jsonb(t)', p_table, sets, p_table)
  INTO newj USING (oldj || newj), p_id;
 IF newj IS NULL THEN RAISE EXCEPTION 'Update denied by existing permissions' USING ERRCODE='42501'; END IF;
 INSERT INTO public.crm_record_field_audit (record_type, record_id, org_company_id, field, old_value, new_value, source, change_reason, actor_user_id)
  SELECT p_table, p_id, org, d.key, d.value->'old', newj->d.key, p_source, p_change_reason, auth.uid() FROM jsonb_each(diff) d;
 RETURN jsonb_build_object('record', newj, 'diff', diff);
END $fn$;
REVOKE ALL ON FUNCTION public.mcp_update_crm_record(text,uuid,jsonb,text,timestamptz,boolean,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mcp_update_crm_record(text,uuid,jsonb,text,timestamptz,boolean,text,text) TO authenticated;

-- 4. Merge preview: runs the real merge in a subtransaction and always rolls it back.
CREATE OR REPLACE FUNCTION public.mcp_merge_lenders_preview(p_keep uuid, p_merge uuid)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public','pg_catalog'
AS $fn$
DECLARE a public.master_lenders; b public.master_lenders; fill jsonb := '{}'; k text; moves jsonb := '{}'; tbl text; col text; cnt int; blocking text := NULL;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM public.master_lenders WHERE id=p_keep;
 SELECT * INTO b FROM public.master_lenders WHERE id=p_merge;
 IF a.id IS NULL OR b.id IS NULL THEN RAISE EXCEPTION 'Both lenders must be visible to you' USING ERRCODE='42501'; END IF;
 FOR k IN SELECT key FROM jsonb_each(to_jsonb(b)) LOOP
  IF k NOT IN ('id','user_id','company_id','name','created_at','updated_at') AND (to_jsonb(a)->k='null' OR to_jsonb(a)->k='""' OR to_jsonb(a)->k='[]') AND to_jsonb(b)->k<>'null' THEN fill := fill || jsonb_build_object(k, to_jsonb(b)->k); END IF;
 END LOOP;
 FOR tbl,col IN SELECT * FROM (VALUES ('lender_contacts','lender_id'),('lender_notes','master_lender_id'),('lender_fit_attributes','master_lender_id'),('lender_pass_patterns','master_lender_id'),('lender_disqualifications','master_lender_id'),('lender_sync_requests','existing_lender_id'),('lender_match_rules','lender_id'),('deal_lenders','master_lender_id'),('deals','current_lender_id')) v LOOP
  EXECUTE format('SELECT count(*) FROM public.%I WHERE %I=$1', tbl, col) INTO cnt USING p_merge;
  IF cnt > 0 THEN moves := moves || jsonb_build_object(tbl, cnt); END IF;
 END LOOP;
 FOR tbl IN SELECT unnest(ARRAY['lender_attachments','lender_doc_flags']) LOOP
  EXECUTE format('SELECT count(*) FROM public.%I WHERE lender_name=$1 AND company_id=$2', tbl) INTO cnt USING b.name, b.company_id;
  IF cnt > 0 THEN moves := moves || jsonb_build_object(tbl, cnt); END IF;
 END LOOP;
 BEGIN
  PERFORM public.mcp_merge_lenders(p_keep, p_merge, true, 'dry_run', NULL);
  RAISE EXCEPTION USING ERRCODE='P0D01', MESSAGE='dry run rollback';
 EXCEPTION
  WHEN SQLSTATE 'P0D01' THEN NULL;
  WHEN OTHERS THEN blocking := SQLERRM;
 END;
 RETURN jsonb_build_object('dry_run', true, 'keep_lender', jsonb_build_object('id',a.id,'name',a.name), 'merge_lender', jsonb_build_object('id',b.id,'name',b.name),
  'fields_filled_on_keep', fill, 'children_to_move', moves, 'can_merge', blocking IS NULL, 'blocking_conflict', blocking);
END $fn$;
REVOKE ALL ON FUNCTION public.mcp_merge_lenders_preview(uuid,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mcp_merge_lenders_preview(uuid,uuid) TO authenticated;

-- 5. Lender contact CRM-link check only when the link changes; delete never blocked; optional relink.
DROP FUNCTION IF EXISTS public.mcp_write_lender_related(text,text,uuid,uuid,jsonb,boolean,text,text);
CREATE FUNCTION public.mcp_write_lender_related(p_table text, p_action text, p_lender_id uuid, p_record_id uuid DEFAULT NULL::uuid, p_patch jsonb DEFAULT '{}'::jsonb, p_confirm boolean DEFAULT false, p_source text DEFAULT NULL::text, p_change_reason text DEFAULT NULL::text, p_relink_crm_contact boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE l public.master_lenders; oldj jsonb; newj jsonb; fields text; vals text; sets text; k text; rowid uuid; r jsonb; contactcompany uuid; contactcrm uuid; demoted jsonb:='[]';
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
 -- Only validate the CRM link when it is being set or changed; edits to other fields and deletes are never blocked by it.
 IF p_table='lender_contacts' AND p_action<>'delete' AND p_patch ? 'contact_id' AND nullif(p_patch->>'contact_id','') IS NOT NULL
    AND (oldj IS NULL OR oldj->>'contact_id' IS DISTINCT FROM p_patch->>'contact_id') THEN
  SELECT coalesce(c.org_company_id,c.company_id), c.crm_company_id INTO contactcompany, contactcrm FROM public.contacts c WHERE c.id=(p_patch->>'contact_id')::uuid;
  IF NOT FOUND OR contactcompany IS DISTINCT FROM l.company_id THEN RAISE EXCEPTION 'CRM contact not found in this workspace' USING ERRCODE='42501'; END IF;
  IF l.crm_company_id IS NOT NULL AND contactcrm IS DISTINCT FROM l.crm_company_id THEN
   IF p_relink_crm_contact THEN
    UPDATE public.contacts SET crm_company_id=l.crm_company_id, last_modified_by=auth.uid() WHERE id=(p_patch->>'contact_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Relinking the CRM contact was denied by existing permissions' USING ERRCODE='42501'; END IF;
   ELSE
    RAISE EXCEPTION 'crm_contact_company_conflict:%', jsonb_build_object('crm_contact_id',p_patch->>'contact_id','contact_crm_company_id',contactcrm,'lender_crm_company_id',l.crm_company_id,'hint','Pass relink_crm_contact_to_lender_company: true to move the CRM contact to the lender company in the same call.')::text USING ERRCODE='P0001';
   END IF;
  END IF;
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
END $function$;
REVOKE ALL ON FUNCTION public.mcp_write_lender_related(text,text,uuid,uuid,jsonb,boolean,text,text,boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mcp_write_lender_related(text,text,uuid,uuid,jsonb,boolean,text,text,boolean) TO authenticated;

-- 6. Preview tolerates tables the caller cannot read (reported in tables_not_readable).
CREATE OR REPLACE FUNCTION public.mcp_merge_lenders_preview(p_keep uuid, p_merge uuid)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public','pg_catalog'
AS $fn$
DECLARE a public.master_lenders; b public.master_lenders; fill jsonb := '{}'; k text; moves jsonb := '{}'; unreadable jsonb := '[]'; tbl text; col text; cnt int; blocking text := NULL;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM public.master_lenders WHERE id=p_keep;
 SELECT * INTO b FROM public.master_lenders WHERE id=p_merge;
 IF a.id IS NULL OR b.id IS NULL THEN RAISE EXCEPTION 'Both lenders must be visible to you' USING ERRCODE='42501'; END IF;
 FOR k IN SELECT key FROM jsonb_each(to_jsonb(b)) LOOP
  IF k NOT IN ('id','user_id','company_id','name','created_at','updated_at') AND (to_jsonb(a)->k='null' OR to_jsonb(a)->k='""' OR to_jsonb(a)->k='[]') AND to_jsonb(b)->k<>'null' THEN fill := fill || jsonb_build_object(k, to_jsonb(b)->k); END IF;
 END LOOP;
 FOR tbl,col IN SELECT * FROM (VALUES ('lender_contacts','lender_id'),('lender_notes','master_lender_id'),('lender_fit_attributes','master_lender_id'),('lender_pass_patterns','master_lender_id'),('lender_disqualifications','master_lender_id'),('lender_sync_requests','existing_lender_id'),('lender_match_rules','lender_id'),('deal_lenders','master_lender_id'),('deals','current_lender_id')) v LOOP
  BEGIN
   EXECUTE format('SELECT count(*) FROM public.%I WHERE %I=$1', tbl, col) INTO cnt USING p_merge;
   IF cnt > 0 THEN moves := moves || jsonb_build_object(tbl, cnt); END IF;
  EXCEPTION WHEN OTHERS THEN unreadable := unreadable || to_jsonb(tbl);
  END;
 END LOOP;
 FOR tbl IN SELECT unnest(ARRAY['lender_attachments','lender_doc_flags']) LOOP
  BEGIN
   EXECUTE format('SELECT count(*) FROM public.%I WHERE lender_name=$1 AND company_id=$2', tbl) INTO cnt USING b.name, b.company_id;
   IF cnt > 0 THEN moves := moves || jsonb_build_object(tbl, cnt); END IF;
  EXCEPTION WHEN OTHERS THEN unreadable := unreadable || to_jsonb(tbl);
  END;
 END LOOP;
 BEGIN
  PERFORM public.mcp_merge_lenders(p_keep, p_merge, true, 'dry_run', NULL);
  RAISE EXCEPTION USING ERRCODE='P0D01', MESSAGE='dry run rollback';
 EXCEPTION
  WHEN SQLSTATE 'P0D01' THEN NULL;
  WHEN OTHERS THEN blocking := SQLERRM;
 END;
 RETURN jsonb_build_object('dry_run', true, 'keep_lender', jsonb_build_object('id',a.id,'name',a.name), 'merge_lender', jsonb_build_object('id',b.id,'name',b.name),
  'fields_filled_on_keep', fill, 'children_to_move', moves, 'tables_not_readable', unreadable, 'can_merge', blocking IS NULL, 'blocking_conflict', blocking);
END $fn$;
