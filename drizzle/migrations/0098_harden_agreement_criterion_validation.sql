ALTER TABLE public.deal_qualifiers ADD CONSTRAINT qualifier_metric_supported CHECK(metric IN ('total_commitment','interest_only_months','term_months','interest_rate','all_in_rate','advance_rate','min_balance','personal_guarantee','board_seat','lender_equity','other')) NOT VALID;
DO $repair$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.upsert_deal_qualifiers_record(uuid,jsonb,text,text,timestamptz,boolean)'::regprocedure) INTO definition;
 definition:=replace(definition,'old_record:=public.get_deal_qualifiers_record(p_deal_id);','PERFORM 1 FROM public.deal_qualifiers WHERE deal_id=p_deal_id FOR UPDATE; old_record:=public.get_deal_qualifiers_record(p_deal_id);');
 definition:=replace(definition,'IF jsonb_typeof(p_record)<>''object'' OR jsonb_typeof(p_record->''criteria'')<>''array''','IF jsonb_typeof(p_record) IS DISTINCT FROM ''object'' OR jsonb_typeof(p_record->''criteria'') IS DISTINCT FROM ''array''');
 definition:=replace(definition,'jsonb_typeof(p_record->''executed_qualifies'')<>''boolean''','jsonb_typeof(p_record->''executed_qualifies'') IS DISTINCT FROM ''boolean''');
 definition:=replace(definition,'jsonb_typeof(x->''text'')<>''string''','jsonb_typeof(x->''text'') IS DISTINCT FROM ''string'' OR jsonb_typeof(x->''position'') IS DISTINCT FROM ''number'' OR (x->>''position'')::numeric <> trunc((x->>''position'')::numeric)');
 definition:=replace(definition,'desired:=jsonb_build_object(', $insert$
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_record->'criteria') x WHERE x->>'id' IS NOT NULL GROUP BY x->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate criterion ID'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_record->'criteria') x WHERE x->>'metric' IS NOT NULL AND x->>'metric' NOT IN ('total_commitment','interest_only_months','term_months','interest_rate','all_in_rate','advance_rate','min_balance','personal_guarantee','board_seat','lender_equity','other')) THEN RAISE EXCEPTION 'Unsupported criterion metric'; END IF;
 IF p_record->>'source_file_url' IS NOT NULL AND p_record->>'source_file_url' !~ '^https://' THEN RAISE EXCEPTION 'Source agreement requires HTTPS'; END IF;
 desired:=jsonb_build_object($insert$);
 EXECUTE definition;
END $repair$;