CREATE SCHEMA IF NOT EXISTS private;
CREATE OR REPLACE FUNCTION private.sync_claap_meeting_deal_children(p_meeting_id uuid, p_old_deal uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE m public.claap_meetings;
BEGIN
 SELECT * INTO m FROM public.claap_meetings WHERE id=p_meeting_id;
 IF NOT FOUND OR m.company_id IS NULL OR NOT public.is_company_member(auth.uid(),m.company_id) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE='42501'; END IF;
 IF p_old_deal IS NOT NULL AND p_old_deal IS DISTINCT FROM m.deal_id THEN
   DELETE FROM public.deal_claap_recordings WHERE deal_id=p_old_deal AND recording_id=m.claap_id;
 END IF;
 IF m.deal_id IS NULL THEN
   DELETE FROM public.claap_transcripts WHERE claap_meeting_id=m.id;
 ELSE
   UPDATE public.claap_transcripts SET deal_id=m.deal_id WHERE claap_meeting_id=m.id;
   INSERT INTO public.deal_claap_recordings(deal_id,recording_id,recording_title,recording_url,duration_seconds,recorder_email,linked_by,notes)
   VALUES(m.deal_id,m.claap_id,m.title,m.recording_url,m.duration_seconds,m.organizer_email,auth.uid(),'Manually linked via connector')
   ON CONFLICT (deal_id,recording_id) DO NOTHING;
 END IF;
END $$;
REVOKE ALL ON FUNCTION private.sync_claap_meeting_deal_children(uuid,uuid) FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.sync_claap_meeting_deal_children(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mcp_update_claap_meeting_deal(p_meeting_id uuid, p_deal_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_catalog AS $$
DECLARE b public.claap_meetings; a public.claap_meetings;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF length(p_reason)>10000 THEN RAISE EXCEPTION 'reason exceeds 10000 characters'; END IF;
 SELECT * INTO b FROM public.claap_meetings WHERE id=p_meeting_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Meeting not found or not visible to you' USING ERRCODE='42501'; END IF;
 IF b.company_id IS NULL OR NOT public.is_company_member(auth.uid(),b.company_id) THEN RAISE EXCEPTION 'Caller is not a member of the meeting workspace' USING ERRCODE='42501'; END IF;
 IF p_deal_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.deals WHERE id=p_deal_id AND company_id=b.company_id) THEN RAISE EXCEPTION 'Deal not found in the meeting workspace' USING ERRCODE='42501'; END IF;
 UPDATE public.claap_meetings SET deal_id=p_deal_id, manually_locked=true, match_method='manual',
   status=CASE WHEN p_deal_id IS NULL THEN 'pending_review'::public.claap_meeting_status ELSE 'routed'::public.claap_meeting_status END,
   match_source=CASE WHEN p_deal_id IS NULL THEN 'Deal link cleared manually' ELSE 'Deal linked manually' END, updated_at=now()
 WHERE id=p_meeting_id RETURNING * INTO a;
 IF NOT FOUND THEN RAISE EXCEPTION 'Caller lacks permission to update this meeting (organizer or company admin required)' USING ERRCODE='42501'; END IF;
 PERFORM private.sync_claap_meeting_deal_children(p_meeting_id, b.deal_id);
 INSERT INTO public.claap_match_audit(meeting_id,action,previous_deal_id,new_deal_id,previous_status,new_status,match_method,match_reason,performed_by,previous_lender_id,new_lender_id,previous_match_status,new_match_status)
 VALUES(p_meeting_id,CASE WHEN p_deal_id IS NULL THEN 'manual_deal_unlink' ELSE 'manual_deal_link' END,b.deal_id,a.deal_id,b.status::text,a.status::text,'manual',p_reason,auth.uid(),b.matched_lender_id,a.matched_lender_id,b.match_status,a.match_status);
 RETURN jsonb_build_object('meeting_id',a.id,'previous_deal_id',b.deal_id,'deal_id',a.deal_id,'status',a.status);
END $$;
REVOKE ALL ON FUNCTION public.mcp_update_claap_meeting_deal(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mcp_update_claap_meeting_deal(uuid,uuid,text) TO authenticated;