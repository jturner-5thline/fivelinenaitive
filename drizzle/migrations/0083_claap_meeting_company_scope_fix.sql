UPDATE public.claap_meetings m SET company_id = cm.company_id
FROM public.profiles p JOIN public.company_members cm ON cm.user_id = p.user_id
WHERE m.company_id IS NULL AND lower(p.email) = lower(m.organizer_email)
  AND (SELECT count(*) FROM public.company_members x WHERE x.user_id = p.user_id) = 1;

UPDATE public.claap_skipped_calls s SET company_id = cm.company_id
FROM public.profiles p JOIN public.company_members cm ON cm.user_id = p.user_id
WHERE s.company_id IS NULL AND lower(p.email) = lower(s.organizer_email)
  AND (SELECT count(*) FROM public.company_members x WHERE x.user_id = p.user_id) = 1;

INSERT INTO public.claap_meetings (claap_id, title, recording_url, organizer_email, duration_seconds, started_at, company_id, status, call_type, match_source)
SELECT s.claap_id, s.title, s.recording_url, s.organizer_email, s.duration_seconds, s.started_at, s.company_id, 'pending_review', 'Unmatched (sync all)', 'Imported from skipped calls (sync_all_calls enabled)'
FROM public.claap_skipped_calls s
WHERE s.claap_id = 'uubf7RjSoMdF' AND s.company_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.claap_meetings m WHERE m.claap_id = s.claap_id);

INSERT INTO public.claap_meeting_participants (meeting_id, name, email, domain, is_internal)
SELECT m.id, p->>'name', p->>'email', p->>'domain', coalesce((p->>'is_internal')::boolean, false)
FROM public.claap_meetings m JOIN public.claap_skipped_calls s ON s.claap_id = m.claap_id
CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.participants, '[]'::jsonb)) p
WHERE m.claap_id = 'uubf7RjSoMdF'
  AND NOT EXISTS (SELECT 1 FROM public.claap_meeting_participants x WHERE x.meeting_id = m.id);

UPDATE public.claap_skipped_calls SET force_synced = true, force_synced_at = now()
WHERE claap_id = 'uubf7RjSoMdF' AND EXISTS (SELECT 1 FROM public.claap_meetings WHERE claap_id = 'uubf7RjSoMdF');

CREATE OR REPLACE FUNCTION public.mcp_update_claap_meeting_match(p_meeting_id uuid,p_matched_lender_id uuid,p_match_status text,p_reason text DEFAULT NULL,p_status public.claap_meeting_status DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_catalog AS $$
DECLARE before_row public.claap_meetings; after_row public.claap_meetings; v_company uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_match_status IS NULL OR p_match_status NOT IN ('matched','needs_review','unmatched') THEN RAISE EXCEPTION 'match_status allowed values: matched, needs_review, unmatched'; END IF;
 IF length(p_reason)>10000 THEN RAISE EXCEPTION 'reason exceeds 10000 characters'; END IF;
 SELECT * INTO before_row FROM public.claap_meetings WHERE id=p_meeting_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Meeting not found or not visible to you' USING ERRCODE='42501'; END IF;
 v_company := before_row.company_id;
 IF v_company IS NULL THEN
   SELECT cm.company_id INTO v_company FROM public.profiles p JOIN public.company_members cm ON cm.user_id=p.user_id
   WHERE p.user_id=auth.uid() AND lower(p.email)=lower(before_row.organizer_email) LIMIT 1;
 END IF;
 IF v_company IS NULL OR NOT public.is_company_member(auth.uid(),v_company) THEN RAISE EXCEPTION 'Caller is not a member of the meeting workspace' USING ERRCODE='42501'; END IF;
 IF p_matched_lender_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.master_lenders WHERE id=p_matched_lender_id AND company_id=v_company) THEN RAISE EXCEPTION 'Funding source not found or not visible in the meeting company' USING ERRCODE='42501'; END IF;
 UPDATE public.claap_meetings SET company_id=v_company,matched_lender_id=p_matched_lender_id,match_status=p_match_status,match_method='manual',manually_locked=true,matched_at=now(),matched_by=auth.uid(),match_reason=p_reason,status=coalesce(p_status,before_row.status),updated_at=now() WHERE id=p_meeting_id RETURNING * INTO after_row;
 IF NOT FOUND THEN RAISE EXCEPTION 'Caller lacks permission to update this meeting (organizer or company admin required)' USING ERRCODE='42501'; END IF;
 INSERT INTO public.claap_match_audit(meeting_id,action,previous_deal_id,new_deal_id,previous_status,new_status,match_method,match_confidence,match_reason,performed_by,previous_lender_id,new_lender_id,previous_match_status,new_match_status)
 VALUES(p_meeting_id,'manual_lender_match',before_row.deal_id,after_row.deal_id,before_row.status::text,after_row.status::text,'manual',after_row.match_confidence,p_reason,auth.uid(),before_row.matched_lender_id,after_row.matched_lender_id,before_row.match_status,after_row.match_status);
 RETURN jsonb_build_object('meeting',to_jsonb(after_row));
END $$;
REVOKE ALL ON FUNCTION public.mcp_update_claap_meeting_match(uuid,uuid,text,text,public.claap_meeting_status) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mcp_update_claap_meeting_match(uuid,uuid,text,text,public.claap_meeting_status) TO authenticated;