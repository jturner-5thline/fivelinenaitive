CREATE OR REPLACE FUNCTION public.is_internal_staff_user()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
  SELECT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = auth.uid()
    AND (lower(u.email) LIKE '%@5thline.co' OR lower(u.email) LIKE '%@naitive.co'));
$$;
REVOKE ALL ON FUNCTION public.is_internal_staff_user() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_internal_staff_user() TO authenticated, service_role;

DROP POLICY IF EXISTS "Internal users read match rules" ON public.lender_match_rules;
CREATE POLICY "Internal users read match rules" ON public.lender_match_rules
  FOR SELECT TO authenticated USING (public.is_internal_staff_user());

DROP POLICY IF EXISTS "Internal users manage match rules" ON public.lender_match_rules;
CREATE POLICY "Internal users manage match rules" ON public.lender_match_rules
  FOR ALL TO authenticated
  USING (public.is_internal_staff_user())
  WITH CHECK (created_by = auth.uid() AND public.is_internal_staff_user());

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
  EXCEPTION WHEN OTHERS THEN unreadable := unreadable || jsonb_build_object('table', tbl, 'error', SQLERRM);
  END;
 END LOOP;
 FOR tbl IN SELECT unnest(ARRAY['lender_attachments','lender_doc_flags']) LOOP
  BEGIN
   EXECUTE format('SELECT count(*) FROM public.%I WHERE lender_name=$1 AND company_id=$2', tbl) INTO cnt USING b.name, b.company_id;
   IF cnt > 0 THEN moves := moves || jsonb_build_object(tbl, cnt); END IF;
  EXCEPTION WHEN OTHERS THEN unreadable := unreadable || jsonb_build_object('table', tbl, 'error', SQLERRM);
  END;
 END LOOP;
 -- Execute the exact real merge (same function, same confirm path), then always roll back.
 BEGIN
  PERFORM public.mcp_merge_lenders(p_keep, p_merge, true, 'dry_run', NULL);
  RAISE EXCEPTION USING ERRCODE='P0D01', MESSAGE='dry run rollback';
 EXCEPTION
  WHEN SQLSTATE 'P0D01' THEN NULL;
  WHEN OTHERS THEN blocking := SQLERRM;
 END;
 IF blocking IS NULL AND unreadable <> '[]' THEN blocking := 'Related tables not readable: ' || unreadable::text; END IF;
 RETURN jsonb_build_object('dry_run', true, 'keep_lender', jsonb_build_object('id',a.id,'name',a.name), 'merge_lender', jsonb_build_object('id',b.id,'name',b.name),
  'fields_filled_on_keep', fill, 'children_to_move', moves, 'tables_not_readable', unreadable, 'can_merge', blocking IS NULL, 'blocking_conflict', blocking);
END $fn$;
REVOKE ALL ON FUNCTION public.mcp_merge_lenders_preview(uuid,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mcp_merge_lenders_preview(uuid,uuid) TO authenticated;