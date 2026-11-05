ALTER TABLE public.lender_audit_logs ADD COLUMN IF NOT EXISTS source text, ADD COLUMN IF NOT EXISTS change_reason text;
CREATE TABLE public.lender_master_note_history (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), note_id uuid NOT NULL, lender_id uuid NOT NULL, user_id uuid NOT NULL, old_record jsonb NOT NULL, new_record jsonb, source text, change_reason text, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT ON public.lender_master_note_history TO authenticated;
GRANT ALL ON public.lender_master_note_history TO service_role;
ALTER TABLE public.lender_master_note_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY lender_master_history_read ON public.lender_master_note_history FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.master_lenders l WHERE l.id=lender_id AND public.is_company_member(auth.uid(),l.company_id)));
CREATE POLICY lender_master_history_insert ON public.lender_master_note_history FOR INSERT TO authenticated WITH CHECK (user_id=auth.uid() AND EXISTS (SELECT 1 FROM public.master_lenders l WHERE l.id=lender_id AND public.is_company_member(auth.uid(),l.company_id)));
CREATE OR REPLACE FUNCTION public.mcp_lender_audit(p_lender_id uuid,p_table text,p_id uuid,p_before jsonb,p_after jsonb,p_source text DEFAULT NULL,p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_catalog AS $$
DECLARE k text; a jsonb; b jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 FOR k IN SELECT key FROM jsonb_each(coalesce(p_before,'{}')||coalesce(p_after,'{}')) LOOP
  IF k IN ('updated_at','created_at') THEN CONTINUE; END IF;
  a:=p_before->k; b:=p_after->k;
  IF a IS DISTINCT FROM b THEN
   INSERT INTO public.lender_audit_logs(lender_id,user_id,action,field_changed,old_value,new_value,metadata,source,change_reason)
   VALUES(p_lender_id,auth.uid(),CASE WHEN p_before IS NULL THEN 'created' WHEN p_after IS NULL THEN 'deleted' ELSE 'updated' END,
    CASE WHEN p_table='master_lenders' THEN k ELSE p_table||'.'||k END,a::text,b::text,
    jsonb_build_object('via','mcp','table',p_table,'record_id',p_id),p_source,p_reason);
  END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.mcp_lender_audit(uuid,text,uuid,jsonb,jsonb,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mcp_lender_audit(uuid,text,uuid,jsonb,jsonb,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.mcp_update_lender(p_lender_id uuid,p_patch jsonb,p_mode text DEFAULT 'replace',p_expected_updated_at timestamptz DEFAULT NULL,p_dry_run boolean DEFAULT false,p_source text DEFAULT NULL,p_change_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_catalog AS $$
DECLARE oldrow public.master_lenders; newrow public.master_lenders; j jsonb; afterj jsonb; k text; v text; lim int; sets text; diff jsonb:='[]';
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_mode IS NULL OR p_mode NOT IN ('replace','append','prepend') THEN RAISE EXCEPTION 'Invalid mode'; END IF;
 IF p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' OR p_patch='{}' THEN RAISE EXCEPTION 'No editable fields supplied'; END IF;
 SELECT * INTO oldrow FROM public.master_lenders WHERE id=p_lender_id FOR UPDATE;
 IF NOT FOUND OR NOT public.is_company_member(auth.uid(),oldrow.company_id) THEN RAISE EXCEPTION 'Lender not found or company access denied' USING ERRCODE='42501'; END IF;
 IF p_expected_updated_at IS NOT NULL AND oldrow.updated_at IS DISTINCT FROM p_expected_updated_at THEN RETURN jsonb_build_object('error','concurrency_conflict','message','Lender changed; inspect current record before retrying.','lender',to_jsonb(oldrow)); END IF;
 j:=to_jsonb(oldrow);
 FOR k IN SELECT key FROM jsonb_each(p_patch) LOOP
  IF k IN ('id','user_id','company_id','created_at','updated_at') OR NOT j ? k THEN RAISE EXCEPTION 'Immutable or unknown master_lenders field: %',k; END IF;
  lim:=CASE k WHEN 'funding_source_notes' THEN 20000 WHEN 'about_notes' THEN 20000 WHEN 'company_requirements' THEN 5000 WHEN 'deal_structure_notes' THEN 10000 WHEN 'upfront_checklist' THEN 10000 WHEN 'post_term_sheet_checklist' THEN 10000 ELSE NULL END;
  IF lim IS NOT NULL AND p_patch->k<>'null'::jsonb THEN
   IF jsonb_typeof(p_patch->k)<>'string' THEN RAISE EXCEPTION '% must be text or null',k; END IF;
   v:=p_patch->>k;
   IF p_mode<>'replace' AND coalesce(j->>k,'')<>'' AND v<>'' THEN v:=CASE p_mode WHEN 'append' THEN (j->>k)||E'\n\n'||v ELSE v||E'\n\n'||(j->>k) END;
   ELSIF p_mode<>'replace' AND v='' THEN v:=coalesce(j->>k,''); END IF;
   IF length(v)>lim THEN RAISE EXCEPTION '% exceeds % characters after combining text',k,lim; END IF;
   p_patch:=jsonb_set(p_patch,ARRAY[k],to_jsonb(v));
  END IF;
 END LOOP;
 newrow:=jsonb_populate_record(oldrow,p_patch);
 IF newrow.name IS NULL OR length(btrim(newrow.name))=0 OR length(newrow.name)>200 THEN RAISE EXCEPTION 'name must have 1 to 200 characters'; END IF;
 IF newrow.criteria_confidence IS NOT NULL AND newrow.criteria_confidence<>'imported' THEN RAISE EXCEPTION 'criteria_confidence allowed values: imported (imported, unverified criteria), null (clear)'; END IF;
 IF newrow.min_deal>newrow.max_deal THEN RAISE EXCEPTION 'min_deal must be <= max_deal'; END IF;
 IF newrow.crm_company_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.crm_companies c WHERE c.id=newrow.crm_company_id AND c.org_company_id=oldrow.company_id) THEN RAISE EXCEPTION 'CRM company must belong to the lender company' USING ERRCODE='42501'; END IF;
 afterj:=to_jsonb(newrow);
 FOR k IN SELECT key FROM jsonb_each(p_patch) LOOP IF j->k IS DISTINCT FROM afterj->k THEN diff:=diff||jsonb_build_array(jsonb_build_object('field',k,'old',j->k,'new',afterj->k)); END IF; END LOOP;
 IF p_dry_run THEN RETURN jsonb_build_object('dry_run',true,'lender',afterj,'diff',diff); END IF;
 IF diff='[]' THEN RETURN jsonb_build_object('lender',j,'diff',diff,'unchanged',true); END IF;
 SELECT string_agg(format('%I = r.%I',key,key),', ') INTO sets FROM jsonb_each(p_patch);
 EXECUTE format('UPDATE public.master_lenders AS l SET %s FROM jsonb_populate_record(NULL::public.master_lenders,$1) r WHERE l.id=$2 RETURNING to_jsonb(l)',sets) INTO afterj USING afterj,p_lender_id;
 IF afterj IS NULL THEN RAISE EXCEPTION 'Update denied by row-level permissions' USING ERRCODE='42501'; END IF;
 PERFORM public.mcp_lender_audit(p_lender_id,'master_lenders',p_lender_id,j,afterj,p_source,p_change_reason);
 RETURN jsonb_build_object('lender',afterj,'diff',diff);
END $$;
REVOKE ALL ON FUNCTION public.mcp_update_lender(uuid,jsonb,text,timestamptz,boolean,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mcp_update_lender(uuid,jsonb,text,timestamptz,boolean,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.tg_lender_contacts_sync_crm() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.contact_id IS DISTINCT FROM OLD.contact_id THEN RETURN NEW; END IF;
 IF current_setting('app.mcp_explicit_crm_link',true)='true' THEN RETURN NEW; END IF;
 IF NEW.contact_id IS NULL THEN BEGIN NEW.contact_id:=public.fn_lender_contact_resolve_crm(NEW.lender_id,NEW.name,NEW.email,NEW.title,NEW.phone,NEW.city,NEW.state,NEW.country); EXCEPTION WHEN others THEN RAISE WARNING 'lender contact CRM sync failed for %: %',NEW.id,SQLERRM; END; END IF;
 RETURN NEW;
END $$;
CREATE POLICY lender_attachment_metadata_update ON public.lender_attachments FOR UPDATE TO authenticated USING (user_id=auth.uid() AND public.is_company_member(auth.uid(),company_id)) WITH CHECK (user_id=auth.uid() AND public.is_company_member(auth.uid(),company_id));
GRANT UPDATE ON public.lender_attachments TO authenticated;