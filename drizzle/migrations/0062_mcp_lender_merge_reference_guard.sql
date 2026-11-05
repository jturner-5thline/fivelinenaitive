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
END $$;
REVOKE ALL ON FUNCTION public.mcp_transfer_lender_audit(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mcp_transfer_lender_audit(uuid,uuid) TO authenticated;