CREATE OR REPLACE FUNCTION public.mcp_update_deal_pipeline(p_deal_id uuid, p_pipeline_id uuid, p_patch jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
 v_before public.deals; v_after public.deals; v_values public.deals; v_target public.deal_pipelines;
 v_old_name text; v_old_label text; v_stage jsonb; v_matches integer; v_input text; v_key text; v_context text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
 IF p_pipeline_id IS NULL THEN RAISE EXCEPTION 'pipeline_id is required'; END IF;
 IF p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' THEN RAISE EXCEPTION 'Invalid update fields'; END IF;
 v_input:=btrim(p_patch->>'stage');
 IF v_input IS NULL OR v_input='' THEN RAISE EXCEPTION 'stage is required when pipeline_id is passed'; END IF;
 FOR v_key IN SELECT jsonb_object_keys(p_patch) LOOP
  IF v_key NOT IN ('stage','value','closing_date','deal_owner','manager','narrative','is_flagged','flag_notes') THEN RAISE EXCEPTION 'Unsupported update field: %',v_key; END IF;
 END LOOP;
 SELECT * INTO v_before FROM public.deals WHERE id=p_deal_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Deal not found or you do not have permission to update it' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_target FROM public.deal_pipelines WHERE id=p_pipeline_id FOR SHARE;
 IF NOT FOUND OR v_target.company_id IS DISTINCT FROM v_before.company_id THEN RAISE EXCEPTION 'Target pipeline not found or you do not have access to it in this deal workspace' USING ERRCODE='42501'; END IF;
 SELECT s INTO v_stage FROM jsonb_array_elements(v_target.stages) s WHERE s->>'id'=v_input;
 IF v_stage IS NULL THEN
  SELECT count(*) INTO v_matches FROM jsonb_array_elements(v_target.stages) s WHERE lower(btrim(s->>'label'))=lower(v_input);
  IF v_matches>1 THEN RAISE EXCEPTION 'Ambiguous stage label in target pipeline; use a stage id'; END IF;
  SELECT s INTO v_stage FROM jsonb_array_elements(v_target.stages) s WHERE lower(btrim(s->>'label'))=lower(v_input);
 END IF;
 IF v_stage IS NULL OR coalesce(v_stage->>'id','')='' THEN RAISE EXCEPTION 'Stage "%" does not exist in target pipeline "%"',v_input,v_target.name; END IF;
 SELECT name,(SELECT s->>'label' FROM jsonb_array_elements(stages) s WHERE s->>'id'=v_before.stage) INTO v_old_name,v_old_label FROM public.deal_pipelines WHERE id=v_before.pipeline_id;
 v_values:=jsonb_populate_record(v_before,p_patch || jsonb_build_object('stage',v_stage->>'id'));
 v_context:=current_setting('naitive.mcp_pipeline_move',true);
 PERFORM set_config('naitive.mcp_pipeline_move','true',true);
 UPDATE public.deals SET pipeline_id=p_pipeline_id,stage=v_values.stage,value=v_values.value,closing_date=v_values.closing_date,deal_owner=v_values.deal_owner,manager=v_values.manager,narrative=v_values.narrative,is_flagged=v_values.is_flagged,flag_notes=v_values.flag_notes,updated_at=now() WHERE id=p_deal_id RETURNING * INTO v_after;
 IF NOT FOUND THEN RAISE EXCEPTION 'You do not have permission to update this deal' USING ERRCODE='42501'; END IF;
 PERFORM set_config('naitive.mcp_pipeline_move',coalesce(v_context,''),true);
 IF v_before.pipeline_id IS DISTINCT FROM v_after.pipeline_id OR v_before.stage IS DISTINCT FROM v_after.stage THEN
  INSERT INTO public.deal_activity(deal_id,user_id,source,action_type,before,after) VALUES(p_deal_id,auth.uid(),'mcp update_deal',CASE WHEN v_before.pipeline_id IS DISTINCT FROM v_after.pipeline_id THEN 'pipeline_changed' ELSE 'stage_changed' END,jsonb_build_object('pipeline_id',v_before.pipeline_id,'pipeline_name',v_old_name,'stage',v_before.stage,'stage_label',coalesce(v_old_label,v_before.stage)),jsonb_build_object('pipeline_id',v_after.pipeline_id,'pipeline_name',v_target.name,'stage',v_after.stage,'stage_label',coalesce(v_stage->>'label',v_after.stage)));
 END IF;
 RETURN to_jsonb(v_after) || jsonb_build_object('pipeline_name',v_target.name,'stage_label',coalesce(v_stage->>'label',v_after.stage));
END; $$;
REVOKE ALL ON FUNCTION public.mcp_update_deal_pipeline(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mcp_update_deal_pipeline(uuid,uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_deal_stage_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_from_label text; v_to_label text;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.stage IS NOT NULL THEN
   INSERT INTO public.deal_stage_history(deal_id,company_id,pipeline_id,from_stage,to_stage,changed_at,changed_by) VALUES(NEW.id,NEW.company_id,NEW.pipeline_id,NULL,NEW.stage,coalesce(NEW.created_at,now()),NEW.user_id);
  END IF;
  RETURN NEW;
 ELSIF TG_OP='UPDATE' THEN
  IF current_setting('naitive.mcp_pipeline_move',true)='true' AND NEW.pipeline_id IS DISTINCT FROM OLD.pipeline_id THEN
   SELECT s->>'label' INTO v_from_label FROM public.deal_pipelines p,jsonb_array_elements(p.stages) s WHERE p.id=OLD.pipeline_id AND s->>'id'=OLD.stage;
   SELECT s->>'label' INTO v_to_label FROM public.deal_pipelines p,jsonb_array_elements(p.stages) s WHERE p.id=NEW.pipeline_id AND s->>'id'=NEW.stage;
   INSERT INTO public.deal_stage_history(deal_id,company_id,pipeline_id,from_stage,to_stage,changed_at,changed_by,source,from_stage_label_raw,to_stage_label_raw) VALUES(NEW.id,NEW.company_id,NEW.pipeline_id,OLD.stage,NEW.stage,now(),auth.uid(),'mcp_pipeline_change',coalesce(v_from_label,OLD.stage),coalesce(v_to_label,NEW.stage));
  ELSIF NEW.stage IS DISTINCT FROM OLD.stage THEN
   INSERT INTO public.deal_stage_history(deal_id,company_id,pipeline_id,from_stage,to_stage,changed_at,changed_by) VALUES(NEW.id,NEW.company_id,NEW.pipeline_id,OLD.stage,NEW.stage,now(),auth.uid());
  END IF;
  RETURN NEW;
 END IF;
 RETURN NEW;
END; $$;