-- Caller-scoped mutations: RLS stays active and activity is in the same transaction.
CREATE OR REPLACE FUNCTION public.mcp_mutate_deal_relationship(p_deal_id uuid, p_action text, p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE
 d public.deals; c public.contacts; l public.contact_deals; old_l public.contact_deals;
 a public.deal_aliases; normalized text; contact_count integer; changed boolean:=false;
 company jsonb; before_value jsonb:='{}'; after_value jsonb:='{}';
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
 IF p_action NOT IN ('link_deal_contact','unlink_deal_contact','add_deal_alias','remove_deal_alias') OR p_action IS NULL THEN RAISE EXCEPTION 'Invalid relationship action'; END IF;
 IF p_input IS NULL OR jsonb_typeof(p_input)<>'object' THEN RAISE EXCEPTION 'Invalid relationship input'; END IF;
 SELECT * INTO d FROM public.deals WHERE id=p_deal_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Deal not found or you do not have access' USING ERRCODE='42501'; END IF;
 IF p_action IN ('link_deal_contact','unlink_deal_contact') THEN
  IF p_input->>'contact_id' IS NULL AND nullif(btrim(p_input->>'email'),'') IS NULL THEN RAISE EXCEPTION 'Provide contact_id or email'; END IF;
  IF p_input->>'contact_id' IS NOT NULL AND p_input->>'email' IS NOT NULL THEN RAISE EXCEPTION 'Provide contact_id or email, not both'; END IF;
  IF p_input->>'contact_id' IS NOT NULL THEN
   SELECT * INTO c FROM public.contacts WHERE id=(p_input->>'contact_id')::uuid AND org_company_id=d.company_id FOR SHARE;
  ELSE
   SELECT count(*) INTO contact_count FROM public.contacts WHERE lower(btrim(email))=lower(btrim(p_input->>'email')) AND org_company_id=d.company_id;
   IF contact_count>1 THEN RAISE EXCEPTION 'Multiple contacts match this email; use contact_id'; END IF;
   SELECT * INTO c FROM public.contacts WHERE lower(btrim(email))=lower(btrim(p_input->>'email')) AND org_company_id=d.company_id FOR SHARE;
  END IF;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Contact not found in this deal workspace or you do not have access; no contact was created' USING ERRCODE='42501'; END IF;
  SELECT * INTO old_l FROM public.contact_deals WHERE deal_id=d.id AND contact_id=c.id;
  before_value:=coalesce(to_jsonb(old_l),'{}');
  IF p_action='link_deal_contact' THEN
   IF p_input ? 'role' AND (jsonb_typeof(p_input->'role')<>'string' OR length(p_input->>'role')>200) THEN RAISE EXCEPTION 'role must be text up to 200 characters'; END IF;
   IF old_l.id IS NULL THEN
    INSERT INTO public.contact_deals(contact_id,deal_id,role) VALUES(c.id,d.id,p_input->>'role') ON CONFLICT(contact_id,deal_id) DO NOTHING RETURNING * INTO l;
    changed:=l.id IS NOT NULL;
    IF NOT changed THEN SELECT * INTO l FROM public.contact_deals WHERE deal_id=d.id AND contact_id=c.id; END IF;
   ELSE
    l:=old_l;
   END IF;
   IF p_input ? 'role' AND l.role IS DISTINCT FROM p_input->>'role' THEN
    UPDATE public.contact_deals SET role=p_input->>'role' WHERE id=l.id RETURNING * INTO l;
    IF NOT FOUND THEN RAISE EXCEPTION 'Contact link update denied' USING ERRCODE='42501'; END IF;
    changed:=true;
   END IF;
   after_value:=to_jsonb(l);
  ELSE
   DELETE FROM public.contact_deals WHERE deal_id=d.id AND contact_id=c.id RETURNING * INTO l;
   changed:=l.id IS NOT NULL;
   IF old_l.id IS NOT NULL AND NOT changed THEN RAISE EXCEPTION 'Contact unlink denied' USING ERRCODE='42501'; END IF;
  END IF;
  SELECT jsonb_build_object('id',id,'name',name,'domain',domain) INTO company FROM public.crm_companies WHERE id=c.crm_company_id AND org_company_id=d.company_id;
  IF changed THEN INSERT INTO public.deal_activity(deal_id,user_id,source,action_type,before,after) VALUES(d.id,auth.uid(),'mcp '||p_action,p_action,before_value,after_value); END IF;
  RETURN jsonb_build_object('changed',changed,'link',CASE WHEN p_action='link_deal_contact' THEN to_jsonb(l) ELSE NULL END,'contact',jsonb_build_object('id',c.id,'name',coalesce(nullif(btrim(concat_ws(' ',c.first_name,c.last_name)),''),c.full_name,c.email),'email',c.email,'company',company));
 END IF;
 IF jsonb_typeof(p_input->'alias') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'alias is required'; END IF;
 normalized:=lower(regexp_replace(btrim(p_input->>'alias'),'\s+',' ','g'));
 normalized:=btrim(normalized);
 IF normalized='' OR length(p_input->>'alias')>500 THEN RAISE EXCEPTION 'alias must contain 1 to 500 characters'; END IF;
 IF p_action='add_deal_alias' THEN
  INSERT INTO public.deal_aliases(deal_id,alias,alias_normalized,created_by) VALUES(d.id,btrim(regexp_replace(p_input->>'alias','\s+',' ','g')),normalized,auth.uid()) ON CONFLICT(deal_id,alias_normalized) DO NOTHING RETURNING * INTO a;
  changed:=a.id IS NOT NULL;
  IF NOT changed THEN SELECT * INTO a FROM public.deal_aliases WHERE deal_id=d.id AND alias_normalized=normalized; END IF;
  after_value:=to_jsonb(a);
 ELSE
  SELECT * INTO a FROM public.deal_aliases WHERE deal_id=d.id AND alias_normalized=normalized;
  before_value:=coalesce(to_jsonb(a),'{}');
  DELETE FROM public.deal_aliases WHERE deal_id=d.id AND alias_normalized=normalized RETURNING * INTO a;
  changed:=a.id IS NOT NULL;
  IF before_value->>'id' IS NOT NULL AND NOT changed THEN RAISE EXCEPTION 'Alias removal denied' USING ERRCODE='42501'; END IF;
 END IF;
 IF changed THEN INSERT INTO public.deal_activity(deal_id,user_id,source,action_type,before,after) VALUES(d.id,auth.uid(),'mcp '||p_action,p_action,before_value,coalesce(after_value,'{}')); END IF;
 RETURN jsonb_build_object('changed',changed,'alias',CASE WHEN p_action='add_deal_alias' THEN to_jsonb(a) ELSE NULL END,'alias_normalized',normalized);
END $$;
REVOKE ALL ON FUNCTION public.mcp_mutate_deal_relationship(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mcp_mutate_deal_relationship(uuid,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.mcp_update_deal_company(p_deal_id uuid,p_crm_company_id uuid,p_pipeline_id uuid,p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE
 old_d public.deals; new_d public.deals; values_d public.deals; company public.crm_companies;
 k text; pipeline_result jsonb; other_changed boolean:=false; company_changed boolean; target public.deal_pipelines; target_stage jsonb; matches integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
 IF p_crm_company_id IS NULL THEN RAISE EXCEPTION 'crm_company_id is required'; END IF;
 IF p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' THEN RAISE EXCEPTION 'Invalid update fields'; END IF;
 FOR k IN SELECT jsonb_object_keys(p_patch) LOOP
  IF k NOT IN ('stage','value','closing_date','deal_owner','manager','narrative','is_flagged','flag_notes') THEN RAISE EXCEPTION 'Unsupported update field: %',k; END IF;
 END LOOP;
 SELECT * INTO old_d FROM public.deals WHERE id=p_deal_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Deal not found or you do not have access' USING ERRCODE='42501'; END IF;
 SELECT * INTO company FROM public.crm_companies WHERE id=p_crm_company_id AND org_company_id=old_d.company_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CRM company not found in this deal workspace or you do not have access' USING ERRCODE='42501'; END IF;
 IF p_pipeline_id IS NOT NULL THEN
  IF nullif(btrim(p_patch->>'stage'),'') IS NULL THEN RAISE EXCEPTION 'stage is required when pipeline_id is passed'; END IF;
  SELECT * INTO target FROM public.deal_pipelines WHERE id=p_pipeline_id AND company_id=old_d.company_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target pipeline not found or you do not have access' USING ERRCODE='42501'; END IF;
  SELECT s INTO target_stage FROM jsonb_array_elements(target.stages) s WHERE s->>'id'=btrim(p_patch->>'stage');
  IF target_stage IS NULL THEN
   SELECT count(*) INTO matches FROM jsonb_array_elements(target.stages) s WHERE lower(btrim(s->>'label'))=lower(btrim(p_patch->>'stage'));
   IF matches>1 THEN RAISE EXCEPTION 'Ambiguous stage label in target pipeline; use a stage id'; END IF;
   SELECT s INTO target_stage FROM jsonb_array_elements(target.stages) s WHERE lower(btrim(s->>'label'))=lower(btrim(p_patch->>'stage'));
  END IF;
  IF coalesce(target_stage->>'id','')='' THEN RAISE EXCEPTION 'Stage does not exist in target pipeline'; END IF;
  p_patch:=p_patch||jsonb_build_object('stage',target_stage->>'id');
 END IF;
 values_d:=jsonb_populate_record(old_d,p_patch);
 FOR k IN SELECT jsonb_object_keys(p_patch) LOOP
  IF to_jsonb(values_d)->k IS DISTINCT FROM to_jsonb(old_d)->k THEN other_changed:=true; END IF;
 END LOOP;
 company_changed:=old_d.crm_company_id IS DISTINCT FROM p_crm_company_id;
 IF p_pipeline_id IS NOT NULL AND (old_d.pipeline_id IS DISTINCT FROM p_pipeline_id OR other_changed) THEN
  pipeline_result:=public.mcp_update_deal_pipeline(p_deal_id,p_pipeline_id,p_patch);
 ELSIF other_changed THEN
  UPDATE public.deals SET stage=values_d.stage,value=values_d.value,closing_date=values_d.closing_date,deal_owner=values_d.deal_owner,manager=values_d.manager,narrative=values_d.narrative,is_flagged=values_d.is_flagged,flag_notes=values_d.flag_notes,updated_at=now() WHERE id=p_deal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Deal update denied' USING ERRCODE='42501'; END IF;
 END IF;
 IF company_changed THEN
  UPDATE public.deals SET crm_company_id=p_crm_company_id,updated_at=now() WHERE id=p_deal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Deal company update denied' USING ERRCODE='42501'; END IF;
 END IF;
 SELECT * INTO new_d FROM public.deals WHERE id=p_deal_id;
 IF company_changed OR other_changed THEN
  INSERT INTO public.deal_activity(deal_id,user_id,source,action_type,before,after) VALUES(p_deal_id,auth.uid(),'mcp update_deal','deal_updated',to_jsonb(old_d),to_jsonb(new_d));
 END IF;
 RETURN to_jsonb(new_d);
END $$;
REVOKE ALL ON FUNCTION public.mcp_update_deal_company(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mcp_update_deal_company(uuid,uuid,uuid,jsonb) TO authenticated;
