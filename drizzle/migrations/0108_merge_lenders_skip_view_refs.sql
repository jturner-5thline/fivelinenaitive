CREATE OR REPLACE FUNCTION private.mcp_transfer_lender_audit_impl(p_keep uuid, p_merge uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE a public.master_lenders; b public.master_lenders; ref record; hasrows boolean;
BEGIN
 IF coalesce(current_setting('app.lender_merge_pair',true),'') IS DISTINCT FROM p_keep::text||':'||p_merge::text THEN RAISE EXCEPTION 'Audit history can only move as part of a lender merge' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM public.master_lenders WHERE id=p_keep;
 SELECT * INTO b FROM public.master_lenders WHERE id=p_merge;
 IF auth.uid() IS NULL OR a.id IS NULL OR b.id IS NULL OR a.company_id IS DISTINCT FROM b.company_id OR NOT public.is_company_member(auth.uid(),a.company_id) OR NOT public.can_delete_lenders(auth.uid()) THEN RAISE EXCEPTION 'Merge permission denied' USING ERRCODE='42501'; END IF;
 FOR ref IN SELECT c.conrelid::regclass rel,att.attname col FROM pg_constraint c JOIN pg_attribute att ON att.attrelid=c.conrelid AND att.attnum=c.conkey[1] WHERE c.confrelid='public.master_lenders'::regclass AND c.contype='f' AND c.conrelid<>'public.lender_audit_logs'::regclass LOOP
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s WHERE %I=$1)',ref.rel,ref.col) INTO hasrows USING p_merge;
  IF hasrows THEN RAISE EXCEPTION 'Merge blocked: related rows remain in % (permissions or conflicting records). No records were merged.',ref.rel; END IF;
 END LOOP;
 -- Only stored base tables can retain references; views (e.g. lender_met_status) are computed from them and follow the kept lender automatically.
 FOR ref IN SELECT c.table_name,c.column_name,c.udt_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name AND t.table_type='BASE TABLE'
   WHERE c.table_schema='public' AND c.table_name NOT IN ('lender_audit_logs','lender_master_note_history') AND ((c.column_name IN ('lender_id','master_lender_id','funding_source_id') AND c.udt_name='uuid') OR (c.column_name='lender_ids' AND c.udt_name='_uuid')) LOOP
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
END $function$;