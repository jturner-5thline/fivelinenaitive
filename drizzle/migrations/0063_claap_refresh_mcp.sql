DO $migration$
DECLARE definition text; original text := 'newrow.criteria_confidence<>''imported''';
BEGIN
 definition := pg_get_functiondef('public.mcp_update_lender(uuid,jsonb,text,timestamptz,boolean,text,text)'::regprocedure);
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'Unexpected criteria confidence validation; migration aborted'; END IF;
 definition := replace(definition, original, 'newrow.criteria_confidence NOT IN (''imported'',''verified_call'',''verified_email'',''verified_attachment'')');
 definition := replace(definition, 'criteria_confidence allowed values: imported (imported, unverified criteria), null (clear)', 'criteria_confidence allowed values: imported, verified_call, verified_email, verified_attachment, null (clear)');
 EXECUTE definition;
END $migration$;
ALTER TABLE public.claap_match_audit ADD COLUMN IF NOT EXISTS previous_lender_id uuid, ADD COLUMN IF NOT EXISTS new_lender_id uuid, ADD COLUMN IF NOT EXISTS previous_match_status text, ADD COLUMN IF NOT EXISTS new_match_status text;
CREATE OR REPLACE FUNCTION public.mcp_update_claap_meeting_match(p_meeting_id uuid,p_matched_lender_id uuid,p_match_status text,p_reason text DEFAULT NULL,p_status public.claap_meeting_status DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_catalog AS $$
DECLARE before_row public.claap_meetings; after_row public.claap_meetings;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_match_status IS NULL OR p_match_status NOT IN ('matched','needs_review','unmatched') THEN RAISE EXCEPTION 'match_status allowed values: matched, needs_review, unmatched'; END IF;
 IF length(p_reason)>10000 THEN RAISE EXCEPTION 'reason exceeds 10000 characters'; END IF;
 SELECT * INTO before_row FROM public.claap_meetings WHERE id=p_meeting_id FOR UPDATE;
 IF NOT FOUND OR NOT public.is_company_member(auth.uid(),before_row.company_id) THEN RAISE EXCEPTION 'Meeting not found or caller lacks company/update permission' USING ERRCODE='42501'; END IF;
 IF p_matched_lender_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.master_lenders WHERE id=p_matched_lender_id AND company_id=before_row.company_id) THEN RAISE EXCEPTION 'Funding source not found or not visible in the meeting company' USING ERRCODE='42501'; END IF;
 UPDATE public.claap_meetings SET matched_lender_id=p_matched_lender_id,match_status=p_match_status,match_method='manual',manually_locked=true,matched_at=now(),matched_by=auth.uid(),match_reason=p_reason,status=coalesce(p_status,before_row.status),updated_at=now() WHERE id=p_meeting_id RETURNING * INTO after_row;
 IF NOT FOUND THEN RAISE EXCEPTION 'Caller lacks permission to update this meeting (organizer or company admin required)' USING ERRCODE='42501'; END IF;
 INSERT INTO public.claap_match_audit(meeting_id,action,previous_deal_id,new_deal_id,previous_status,new_status,match_method,match_confidence,match_reason,performed_by,previous_lender_id,new_lender_id,previous_match_status,new_match_status)
 VALUES(p_meeting_id,'manual_lender_match',before_row.deal_id,after_row.deal_id,before_row.status::text,after_row.status::text,'manual',after_row.match_confidence,p_reason,auth.uid(),before_row.matched_lender_id,after_row.matched_lender_id,before_row.match_status,after_row.match_status);
 RETURN jsonb_build_object('meeting',to_jsonb(after_row));
END $$;
REVOKE ALL ON FUNCTION public.mcp_update_claap_meeting_match(uuid,uuid,text,text,public.claap_meeting_status) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mcp_update_claap_meeting_match(uuid,uuid,text,text,public.claap_meeting_status) TO authenticated;
CREATE OR REPLACE FUNCTION public.mcp_list_lender_claap_meetings(p_lender_ids uuid[] DEFAULT NULL,p_updated_after timestamptz DEFAULT NULL,p_match_statuses text[] DEFAULT NULL,p_include_transcript boolean DEFAULT false,p_limit integer DEFAULT 50,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_catalog AS $$
DECLARE result jsonb; more boolean;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit<1 OR p_limit>200 OR p_offset IS NULL OR p_offset<0 OR p_offset>1000000 THEN RAISE EXCEPTION 'limit must be 1..200 and offset 0..1000000'; END IF;
 IF cardinality(p_lender_ids)>200 THEN RAISE EXCEPTION 'At most 200 lender IDs'; END IF;
 IF p_match_statuses IS NOT NULL AND (cardinality(p_match_statuses)>3 OR EXISTS(SELECT 1 FROM unnest(p_match_statuses) s WHERE s IS NULL OR s NOT IN ('matched','needs_review','unmatched'))) THEN RAISE EXCEPTION 'match_statuses allowed values: matched, needs_review, unmatched'; END IF;
 WITH page AS (
 SELECT m.* FROM public.claap_meetings m WHERE (p_lender_ids IS NULL OR m.matched_lender_id=ANY(p_lender_ids)) AND (p_updated_after IS NULL OR greatest(m.matched_at,m.updated_at)>p_updated_after) AND (p_match_statuses IS NULL OR m.match_status=ANY(p_match_statuses)) ORDER BY greatest(m.matched_at,m.updated_at) DESC NULLS LAST,m.id LIMIT p_limit+1 OFFSET p_offset
 ),numbered AS (SELECT page.*,row_number() OVER(ORDER BY greatest(matched_at,updated_at) DESC NULLS LAST,id) AS rn FROM page)
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'claap_id',m.claap_id,'title',m.title,'started_at',m.started_at,'matched_at',m.matched_at,'updated_at',m.updated_at,'call_type',m.call_type,'status',m.status,'match_status',m.match_status,'match_confidence',m.match_confidence,'match_source',m.match_source,'matched_lender_id',m.matched_lender_id,'deal_id',m.deal_id,'recording_url',m.recording_url,'ai_summary',m.ai_summary,'key_decisions',m.key_decisions,'next_steps',m.next_steps,'topics',m.topics,'participants',coalesce((SELECT jsonb_agg(jsonb_build_object('name',p.name,'email',p.email,'domain',p.domain,'is_internal',p.is_internal) ORDER BY p.id) FROM public.claap_meeting_participants p WHERE p.meeting_id=m.id),'[]'::jsonb)) || CASE WHEN p_include_transcript THEN jsonb_build_object('transcript',m.transcript) ELSE '{}'::jsonb END ORDER BY m.rn) FILTER(WHERE m.rn<=p_limit),'[]'::jsonb),coalesce(bool_or(m.rn>p_limit),false) INTO result,more FROM numbered m;
 RETURN jsonb_build_object('meetings',result,'count',jsonb_array_length(result),'has_more',more,'next_offset',CASE WHEN more THEN p_offset+p_limit ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION public.mcp_list_lender_claap_meetings(uuid[],timestamptz,text[],boolean,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mcp_list_lender_claap_meetings(uuid[],timestamptz,text[],boolean,integer,integer) TO authenticated;