CREATE OR REPLACE FUNCTION private.merge_lender_retained_refs(p_keep uuid, p_merge uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS $$
DECLARE a public.master_lenders; b public.master_lenders; res jsonb := '{}'; n int; ids jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_delete_lenders(auth.uid()) THEN RAISE EXCEPTION 'Lender merge requires existing lender deletion permission' USING ERRCODE='42501'; END IF;
  IF coalesce(current_setting('app.lender_merge_pair', true), '') <> p_keep::text || ':' || p_merge::text THEN RAISE EXCEPTION 'Only callable inside an explicit lender merge' USING ERRCODE='42501'; END IF;
  SELECT * INTO a FROM public.master_lenders WHERE id = p_keep;
  SELECT * INTO b FROM public.master_lenders WHERE id = p_merge;
  IF a.id IS NULL OR b.id IS NULL OR a.company_id IS DISTINCT FROM b.company_id OR NOT public.is_company_member(auth.uid(), a.company_id) THEN RAISE EXCEPTION 'Both lenders must be accessible in the same company' USING ERRCODE='42501'; END IF;

  WITH d AS (DELETE FROM public.lender_fit_attributes m WHERE m.master_lender_id = p_merge
     AND EXISTS (SELECT 1 FROM public.lender_fit_attributes k WHERE k.master_lender_id = p_keep) RETURNING m.id)
  SELECT coalesce(jsonb_agg(id), '[]') INTO ids FROM d;
  res := res || jsonb_build_object('lender_fit_attributes_dropped', ids);

  WITH d AS (DELETE FROM public.lender_recommendation_outcomes m WHERE m.lender_id = p_merge
     AND EXISTS (SELECT 1 FROM public.lender_recommendation_outcomes k WHERE k.lender_id = p_keep AND k.deal_id = m.deal_id) RETURNING m.id)
  SELECT coalesce(jsonb_agg(id), '[]') INTO ids FROM d;
  res := res || jsonb_build_object('lender_recommendation_outcomes_dropped', ids);
  UPDATE public.lender_recommendation_outcomes SET lender_id = p_keep, lender_name = a.name WHERE lender_id = p_merge;
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('lender_recommendation_outcomes_moved', n);

  UPDATE public.lender_recommendation_run_items SET lender_id = p_keep WHERE lender_id = p_merge;
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('lender_recommendation_run_items_moved', n);

  UPDATE public.mcp_lender_write_log SET lender_id = p_keep WHERE lender_id = p_merge;
  GET DIAGNOSTICS n = ROW_COUNT; res := res || jsonb_build_object('mcp_lender_write_log_moved', n);

  RETURN res;
END $$;
REVOKE ALL ON FUNCTION private.merge_lender_retained_refs(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.merge_lender_retained_refs(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mcp_merge_lenders(p_keep uuid, p_merge uuid, p_confirm boolean, p_source text DEFAULT NULL::text, p_change_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE a public.master_lenders; b public.master_lenders; oldj jsonb; newj jsonb; r jsonb; patch jsonb:='{}'; k text; tbl text; col text; cnt int;
 dup record; extra text; refs jsonb; dups jsonb := '[]'; newres jsonb;
BEGIN
 IF p_confirm IS DISTINCT FROM true OR p_keep=p_merge THEN RAISE EXCEPTION 'confirm:true and two different lenders required'; END IF;
 IF auth.uid() IS NULL OR NOT public.can_delete_lenders(auth.uid()) THEN RAISE EXCEPTION 'Lender merge requires existing lender deletion permission' USING ERRCODE='42501'; END IF;
 PERFORM id FROM public.master_lenders WHERE id IN (p_keep,p_merge) ORDER BY id FOR UPDATE;
 SELECT * INTO a FROM public.master_lenders WHERE id=p_keep;
 SELECT * INTO b FROM public.master_lenders WHERE id=p_merge;
 IF a.id IS NULL OR b.id IS NULL OR a.company_id IS DISTINCT FROM b.company_id OR NOT public.is_company_member(auth.uid(),a.company_id) THEN RAISE EXCEPTION 'Both lenders must be accessible in the same company' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.lender_contacts WHERE lender_id=p_keep AND is_primary) AND EXISTS(SELECT 1 FROM public.lender_contacts WHERE lender_id=p_merge AND is_primary) THEN RAISE EXCEPTION 'Both lenders have primary contacts; demote one before merging.'; END IF;
 PERFORM set_config('app.lender_merge_pair',p_keep::text||':'||p_merge::text,true);

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
 refs := private.merge_lender_retained_refs(p_keep, p_merge);
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
 INSERT INTO public.mcp_lender_write_log(user_id, tool, target_table, target_id, lender_id, action, before, after)
  VALUES (auth.uid(), 'merge_lenders', 'master_lenders', p_merge, p_keep, 'merge', to_jsonb(b), jsonb_build_object('keep_lender_id',p_keep,'removed_lender_id',p_merge,'source',p_source,'change_reason',p_change_reason,'duplicate_deal_links_resolved',dups,'new_tables',newres,'retained_refs',refs));
 RETURN jsonb_build_object('merged',true,'keep_lender_id',p_keep,'removed_lender_id',p_merge,'duplicate_deal_links_resolved',dups,'new_tables',newres,'retained_refs',refs);
END $function$;

GRANT DELETE ON public.lender_fit_attributes TO authenticated;
DROP POLICY IF EXISTS "Members can delete lender fit attributes" ON public.lender_fit_attributes;
CREATE POLICY "Members can delete lender fit attributes" ON public.lender_fit_attributes FOR DELETE TO authenticated
  USING ((company_id IS NULL) OR (company_id = ANY (public.get_user_company_ids(auth.uid()))));