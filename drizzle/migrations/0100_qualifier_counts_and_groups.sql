ALTER TABLE public.deal_qualifier_agreements ADD COLUMN min_required integer, ADD COLUMN groups jsonb, ADD COLUMN groups_logic text NOT NULL DEFAULT 'all_groups' CHECK(groups_logic IN ('all_groups','each_group_separately'));
ALTER TABLE public.deal_qualifier_agreements ADD CONSTRAINT qualifier_min_positive CHECK(min_required IS NULL OR min_required>=1);
ALTER TABLE public.deal_qualifiers ADD COLUMN "group" text;
CREATE FUNCTION public.validate_qualifier_groups(p_record jsonb) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE g jsonb; n numeric; count_rows integer; gs jsonb:=coalesce(nullif(p_record->'groups','null'::jsonb),'[]'::jsonb);
BEGIN
 IF jsonb_typeof(gs)<>'array' OR jsonb_array_length(gs)>200 OR coalesce(p_record->>'groups_logic','all_groups') NOT IN ('all_groups','each_group_separately') THEN RAISE EXCEPTION 'Invalid qualifier groups'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(gs) x GROUP BY x->>'key' HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate group key'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_record->'criteria') x WHERE x->>'group' IS NOT NULL AND (jsonb_typeof(x->'group')<>'string' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(gs) y WHERE y->>'key'=x->>'group'))) THEN RAISE EXCEPTION 'Unknown criterion group'; END IF;
 SELECT count(*) INTO count_rows FROM jsonb_array_elements(p_record->'criteria') x WHERE x->>'group' IS NULL;
 IF p_record->>'min_required' IS NOT NULL THEN
  IF jsonb_typeof(p_record->'min_required')<>'number' THEN RAISE EXCEPTION 'Invalid minimum count'; END IF;
  n:=(p_record->>'min_required')::numeric;
  IF n<>trunc(n) OR n<1 OR n>count_rows THEN RAISE EXCEPTION 'Required count must be 1 through number of ungrouped criteria'; END IF;
 END IF;
 FOR g IN SELECT x FROM jsonb_array_elements(gs) x LOOP
  IF jsonb_typeof(g)<>'object' OR jsonb_typeof(g->'key') IS DISTINCT FROM 'string' OR nullif(btrim(g->>'key'),'') IS NULL OR jsonb_typeof(g->'label') IS DISTINCT FROM 'string' OR nullif(btrim(g->>'label'),'') IS NULL OR coalesce(g->>'match_rule','') NOT IN ('all','any') THEN RAISE EXCEPTION 'Invalid group'; END IF;
  SELECT count(*) INTO count_rows FROM jsonb_array_elements(p_record->'criteria') x WHERE x->>'group'=g->>'key';
  IF g->>'min_required' IS NOT NULL THEN
   IF jsonb_typeof(g->'min_required')<>'number' THEN RAISE EXCEPTION 'Invalid group minimum'; END IF;
   n:=(g->>'min_required')::numeric;
   IF n<>trunc(n) OR n<1 OR n>count_rows THEN RAISE EXCEPTION 'Group required count exceeds its criteria'; END IF;
  END IF;
  IF g->>'fee' IS NOT NULL AND (jsonb_typeof(g->'fee')<>'number' OR (g->>'fee')::numeric<0) THEN RAISE EXCEPTION 'Invalid group fee'; END IF;
  IF g->>'notes' IS NOT NULL AND jsonb_typeof(g->'notes')<>'string' THEN RAISE EXCEPTION 'Invalid group notes'; END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.validate_qualifier_groups(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.validate_qualifier_groups(jsonb) TO authenticated;
DO $patch$
DECLARE original text; definition text;
BEGIN
 SELECT pg_get_functiondef('public.get_deal_qualifiers_record(uuid)'::regprocedure) INTO original;
 definition:=replace(original,'''unit'',unit)', '''unit'',unit,''group'',"group")');
 definition:=replace(definition,'''match_rule'',''all''))', '''match_rule'',''all'',''min_required'',null,''groups'',null,''groups_logic'',''all_groups''))');
 IF definition=original THEN RAISE EXCEPTION 'Read function patch failed'; END IF;
 EXECUTE definition;
 SELECT pg_get_functiondef('public.upsert_deal_qualifiers_record(uuid,jsonb,text,text,timestamptz,boolean)'::regprocedure) INTO original;
 definition:=replace(original,'desired:=jsonb_build_object(', 'PERFORM public.validate_qualifier_groups(p_record); desired:=jsonb_build_object(');
 definition:=replace(definition,'''notes'',p_record->''notes'',''criteria''', '''notes'',p_record->''notes'',''min_required'',p_record->''min_required'',''groups'',p_record->''groups'',''groups_logic'',coalesce(p_record->>''groups_logic'',''all_groups''),''criteria''');
 definition:=replace(definition,'''unit'',c->''unit'')))', '''unit'',c->''unit'',''group'',c->''group'')))');
 definition:=replace(definition,'is_met,metric,operator,value,unit) VALUES', 'is_met,metric,operator,value,unit,"group") VALUES');
 definition:=replace(definition,'c->>''unit'') RETURNING', 'c->>''unit'',c->>''group'') RETURNING');
 definition:=replace(definition,'unit=c->>''unit'' WHERE', 'unit=c->>''unit'',"group"=c->>''group'' WHERE');
 definition:=replace(definition,'notes,updated_by,source,updated_at) VALUES', 'notes,min_required,groups,groups_logic,updated_by,source,updated_at) VALUES');
 definition:=replace(definition,'p_record->>''notes'',auth.uid()', 'p_record->>''notes'',(p_record->>''min_required'')::integer,nullif(p_record->''groups'',''null''::jsonb),coalesce(p_record->>''groups_logic'',''all_groups''),auth.uid()');
 definition:=replace(definition,'notes=excluded.notes,updated_by', 'notes=excluded.notes,min_required=excluded.min_required,groups=excluded.groups,groups_logic=excluded.groups_logic,updated_by');
 definition:=replace(definition,'''qualifiers_updated'',old_record,new_record', '''qualifiers_updated'',coalesce(old_record,''{}''::jsonb),new_record');
 definition:=replace(definition,'ELSE c:=coalesce(old_record->k,''null''::jsonb);', 'ELSE c:=coalesce(old_record->k,CASE WHEN k=''groups_logic'' THEN ''"all_groups"''::jsonb ELSE ''null''::jsonb END);');
 IF definition=original OR position('PERFORM public.validate_qualifier_groups' IN definition)=0 OR position('coalesce(old_record,''{}''::jsonb)' IN definition)=0 THEN RAISE EXCEPTION 'Write function patch failed'; END IF;
 EXECUTE definition;
END $patch$;