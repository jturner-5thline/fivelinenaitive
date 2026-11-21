ALTER TABLE public.deals ADD COLUMN success_fee_minimum numeric CHECK (success_fee_minimum >= 0);
ALTER TABLE public.deals ALTER COLUMN total_fee SET EXPRESSION AS (greatest(coalesce(value,0)*coalesce(success_fee_percent,0)/100,coalesce(success_fee_minimum,0)));
ALTER TABLE public.deal_qualifiers ADD COLUMN metric text, ADD COLUMN operator text CHECK(operator IN ('>=','<=','=','none')), ADD COLUMN value numeric, ADD COLUMN unit text;
CREATE TABLE public.deal_qualifier_agreements (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), deal_id uuid NOT NULL UNIQUE REFERENCES public.deals(id) ON DELETE CASCADE, company_id uuid, executed_qualifies boolean NOT NULL DEFAULT false, match_rule text NOT NULL DEFAULT 'all' CHECK(match_rule IN ('all','any')), source_file_id text, source_file_url text, agreement_signed_date date, notes text, updated_by uuid, source text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,INSERT,UPDATE,DELETE ON public.deal_qualifier_agreements TO authenticated;
GRANT ALL ON public.deal_qualifier_agreements TO service_role;
ALTER TABLE public.deal_qualifier_agreements ENABLE ROW LEVEL SECURITY;
CREATE POLICY agreement_access ON public.deal_qualifier_agreements FOR ALL TO authenticated USING(public.can_access_deal(auth.uid(),deal_id)) WITH CHECK(public.can_access_deal(auth.uid(),deal_id) AND company_id IS NOT DISTINCT FROM (SELECT company_id FROM public.deals WHERE id=deal_id));
CREATE FUNCTION public.get_deal_qualifiers_record(p_deal_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE a jsonb; criteria jsonb; stamp timestamptz;
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_access_deal(auth.uid(),p_deal_id) THEN RAISE EXCEPTION 'Deal not found or access denied' USING ERRCODE='42501'; END IF;
 SELECT to_jsonb(t) INTO a FROM public.deal_qualifier_agreements t WHERE deal_id=p_deal_id;
 SELECT jsonb_agg(jsonb_build_object('id',id,'position',position,'text',text,'is_met',is_met,'metric',metric,'operator',operator,'value',value,'unit',unit) ORDER BY position,created_at,id),max(updated_at) INTO criteria,stamp FROM public.deal_qualifiers WHERE deal_id=p_deal_id;
 IF a IS NULL AND criteria IS NULL THEN RETURN NULL; END IF;
 RETURN coalesce(a,jsonb_build_object('deal_id',p_deal_id,'executed_qualifies',false,'match_rule','all')) || jsonb_build_object('criteria',coalesce(criteria,'[]'::jsonb),'updated_at',greatest(stamp,(a->>'updated_at')::timestamptz));
END $$;
CREATE FUNCTION public.update_deal_fees(p_deal_id uuid,p_patch jsonb,p_source text DEFAULT 'mcp',p_change_reason text DEFAULT NULL,p_expected_updated_at timestamptz DEFAULT NULL,p_dry_run boolean DEFAULT true) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE old_d public.deals; new_d public.deals; candidate public.deals; k text; diffs jsonb:='{}';
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
 IF p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' THEN RAISE EXCEPTION 'Fields must be an object'; END IF;
 FOR k IN SELECT jsonb_object_keys(p_patch) LOOP
  IF k NOT IN ('retainer_fee','milestone_fee','success_fee_percent','success_fee_minimum','exclusivity','contract_start_date','contract_end_date') THEN RAISE EXCEPTION 'Unsupported fee field: %',k; END IF;
 END LOOP;
 SELECT * INTO old_d FROM public.deals WHERE id=p_deal_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Deal not found or access denied' USING ERRCODE='42501'; END IF;
 IF p_expected_updated_at IS NOT NULL AND p_expected_updated_at IS DISTINCT FROM old_d.updated_at THEN RETURN jsonb_build_object('conflict',true,'current',to_jsonb(old_d)); END IF;
 candidate:=jsonb_populate_record(old_d,p_patch);
 IF candidate.retainer_fee<0 OR candidate.milestone_fee<0 OR candidate.success_fee_minimum<0 OR candidate.success_fee_percent<0 OR candidate.success_fee_percent>100 THEN RAISE EXCEPTION 'Fees must be nonnegative and percent at most 100'; END IF;
 IF candidate.contract_start_date>candidate.contract_end_date THEN RAISE EXCEPTION 'Contract end precedes start'; END IF;
 FOR k IN SELECT jsonb_object_keys(p_patch) LOOP
  IF to_jsonb(old_d)->k IS DISTINCT FROM to_jsonb(candidate)->k THEN diffs:=diffs||jsonb_build_object(k,jsonb_build_object('old',to_jsonb(old_d)->k,'new',to_jsonb(candidate)->k)); END IF;
 END LOOP;
 IF p_dry_run OR diffs='{}'::jsonb THEN RETURN jsonb_build_object('dry_run',p_dry_run,'changed',diffs<>'{}'::jsonb,'diffs',diffs,'current',to_jsonb(old_d)); END IF;
 UPDATE public.deals SET retainer_fee=candidate.retainer_fee,milestone_fee=candidate.milestone_fee,success_fee_percent=candidate.success_fee_percent,success_fee_minimum=candidate.success_fee_minimum,exclusivity=candidate.exclusivity,contract_start_date=candidate.contract_start_date,contract_end_date=candidate.contract_end_date,updated_at=clock_timestamp() WHERE id=p_deal_id RETURNING * INTO new_d;
 IF NOT FOUND THEN RAISE EXCEPTION 'Deal update denied' USING ERRCODE='42501'; END IF;
 FOR k IN SELECT jsonb_object_keys(diffs) LOOP
  INSERT INTO public.deal_audit_log(deal_id,user_id,action_type,entity_type,entity_id,entity_name,metadata,source) VALUES(p_deal_id,auth.uid(),'fees_updated','deal',p_deal_id::text,k,(diffs->k)||jsonb_build_object('field',k,'source',p_source,'change_reason',p_change_reason),p_source);
 END LOOP;
 INSERT INTO public.deal_activity(deal_id,user_id,source,action_type,before,after) VALUES(p_deal_id,auth.uid(),p_source,'fees_updated',to_jsonb(old_d),to_jsonb(new_d));
 RETURN jsonb_build_object('dry_run',false,'changed',true,'diffs',diffs,'record',to_jsonb(new_d));
END $$;
CREATE FUNCTION public.upsert_deal_qualifiers_record(p_deal_id uuid,p_record jsonb,p_source text DEFAULT 'mcp',p_change_reason text DEFAULT NULL,p_expected_updated_at timestamptz DEFAULT NULL,p_dry_run boolean DEFAULT true) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE d public.deals; old_record jsonb; new_record jsonb; desired jsonb; c jsonb; prev public.deal_qualifiers; keep_ids uuid[]:='{}'; row_id uuid; diffs jsonb:='{}'; k text; stamp timestamptz;
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_access_deal(auth.uid(),p_deal_id) THEN RAISE EXCEPTION 'Deal not found or access denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('qualifiers:'||p_deal_id::text,0));
 SELECT * INTO d FROM public.deals WHERE id=p_deal_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Deal not found or access denied' USING ERRCODE='42501'; END IF;
 old_record:=public.get_deal_qualifiers_record(p_deal_id);
 IF p_expected_updated_at IS NOT NULL AND (old_record->>'updated_at')::timestamptz IS DISTINCT FROM p_expected_updated_at THEN RETURN jsonb_build_object('conflict',true,'current',old_record); END IF;
 IF jsonb_typeof(p_record)<>'object' OR jsonb_typeof(p_record->'criteria')<>'array' OR jsonb_array_length(p_record->'criteria')>200 OR jsonb_typeof(p_record->'executed_qualifies')<>'boolean' OR coalesce(p_record->>'match_rule','') NOT IN ('all','any') THEN RAISE EXCEPTION 'Invalid qualifier agreement'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_record->'criteria') x WHERE jsonb_typeof(x->'text')<>'string' OR nullif(btrim(x->>'text'),'') IS NULL OR (x->>'position')::integer<0 OR coalesce(x->>'operator','none') NOT IN ('>=','<=','=','none')) THEN RAISE EXCEPTION 'Invalid criterion'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_record->'criteria') x GROUP BY x->>'position' HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate criterion position'; END IF;
 desired:=jsonb_build_object('executed_qualifies',p_record->'executed_qualifies','match_rule',p_record->'match_rule','source_file_id',p_record->'source_file_id','source_file_url',p_record->'source_file_url','agreement_signed_date',p_record->'agreement_signed_date','notes',p_record->'notes','criteria','[]'::jsonb);
 FOR c IN SELECT x FROM jsonb_array_elements(p_record->'criteria') x ORDER BY (x->>'position')::int LOOP
  prev:=NULL;
  IF c->>'id' IS NOT NULL THEN SELECT * INTO prev FROM public.deal_qualifiers WHERE deal_id=p_deal_id AND id=(c->>'id')::uuid; IF NOT FOUND THEN RAISE EXCEPTION 'Criterion not in this deal' USING ERRCODE='42501'; END IF;
  ELSE SELECT * INTO prev FROM public.deal_qualifiers WHERE deal_id=p_deal_id AND position=(c->>'position')::int AND text=c->>'text' ORDER BY id LIMIT 1; END IF;
  desired:=jsonb_set(desired,'{criteria}',(desired->'criteria')||jsonb_build_array(jsonb_build_object('position',(c->>'position')::int,'text',c->>'text','is_met',coalesce((c->>'is_met')::boolean,prev.is_met,false),'metric',c->'metric','operator',c->'operator','value',c->'value','unit',c->'unit')));
 END LOOP;
 FOR k IN SELECT jsonb_object_keys(desired) LOOP
  IF k='criteria' THEN SELECT coalesce(jsonb_agg(x-'id' ORDER BY (x->>'position')::int),'[]'::jsonb) INTO c FROM jsonb_array_elements(coalesce(old_record->'criteria','[]'::jsonb)) x;
  ELSE c:=coalesce(old_record->k,'null'::jsonb); END IF;
  IF c IS DISTINCT FROM desired->k THEN diffs:=diffs||jsonb_build_object(k,jsonb_build_object('old',c,'new',desired->k)); END IF;
 END LOOP;
 IF p_dry_run OR diffs='{}'::jsonb THEN RETURN jsonb_build_object('dry_run',p_dry_run,'changed',diffs<>'{}'::jsonb,'diffs',diffs,'current',old_record,'proposed',desired); END IF;
 FOR c IN SELECT x FROM jsonb_array_elements(p_record->'criteria') x LOOP
  prev:=NULL;
  IF c->>'id' IS NOT NULL THEN SELECT * INTO prev FROM public.deal_qualifiers WHERE deal_id=p_deal_id AND id=(c->>'id')::uuid;
  ELSE SELECT * INTO prev FROM public.deal_qualifiers WHERE deal_id=p_deal_id AND position=(c->>'position')::int AND text=c->>'text' AND NOT(id=ANY(keep_ids)) ORDER BY id LIMIT 1; END IF;
  IF prev.id IS NULL THEN INSERT INTO public.deal_qualifiers(deal_id,text,position,is_met,metric,operator,value,unit) VALUES(p_deal_id,c->>'text',(c->>'position')::int,coalesce((c->>'is_met')::boolean,false),c->>'metric',c->>'operator',(c->>'value')::numeric,c->>'unit') RETURNING id INTO row_id;
  ELSE UPDATE public.deal_qualifiers SET text=c->>'text',position=(c->>'position')::int,is_met=coalesce((c->>'is_met')::boolean,prev.is_met),metric=c->>'metric',operator=c->>'operator',value=(c->>'value')::numeric,unit=c->>'unit' WHERE id=prev.id RETURNING id INTO row_id; END IF;
  keep_ids:=array_append(keep_ids,row_id);
 END LOOP;
 DELETE FROM public.deal_qualifiers WHERE deal_id=p_deal_id AND NOT(id=ANY(keep_ids));
 INSERT INTO public.deal_qualifier_agreements(deal_id,company_id,executed_qualifies,match_rule,source_file_id,source_file_url,agreement_signed_date,notes,updated_by,source,updated_at) VALUES(p_deal_id,d.company_id,(p_record->>'executed_qualifies')::boolean,p_record->>'match_rule',p_record->>'source_file_id',p_record->>'source_file_url',(p_record->>'agreement_signed_date')::date,p_record->>'notes',auth.uid(),p_source,clock_timestamp()) ON CONFLICT(deal_id) DO UPDATE SET executed_qualifies=excluded.executed_qualifies,match_rule=excluded.match_rule,source_file_id=excluded.source_file_id,source_file_url=excluded.source_file_url,agreement_signed_date=excluded.agreement_signed_date,notes=excluded.notes,updated_by=excluded.updated_by,source=excluded.source,updated_at=excluded.updated_at;
 new_record:=public.get_deal_qualifiers_record(p_deal_id);
 FOR k IN SELECT jsonb_object_keys(diffs) LOOP INSERT INTO public.deal_audit_log(deal_id,user_id,action_type,entity_type,entity_id,entity_name,metadata,source) VALUES(p_deal_id,auth.uid(),'qualifiers_updated','deal',p_deal_id::text,k,(diffs->k)||jsonb_build_object('field',k,'source',p_source,'change_reason',p_change_reason),p_source); END LOOP;
 INSERT INTO public.deal_activity(deal_id,user_id,source,action_type,before,after) VALUES(p_deal_id,auth.uid(),p_source,'qualifiers_updated',old_record,new_record);
 RETURN jsonb_build_object('dry_run',false,'changed',true,'diffs',diffs,'record',new_record);
END $$;
REVOKE ALL ON FUNCTION public.get_deal_qualifiers_record(uuid),public.update_deal_fees(uuid,jsonb,text,text,timestamptz,boolean),public.upsert_deal_qualifiers_record(uuid,jsonb,text,text,timestamptz,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_deal_qualifiers_record(uuid),public.update_deal_fees(uuid,jsonb,text,text,timestamptz,boolean),public.upsert_deal_qualifiers_record(uuid,jsonb,text,text,timestamptz,boolean) TO authenticated;