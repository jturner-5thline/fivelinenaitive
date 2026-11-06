-- Run ONLY in a disposable local PostgreSQL instance after lender-test-schema.sql,
-- migration 0059; migration 0063 is loaded below after fixture setup.
CREATE TYPE public.claap_meeting_status AS ENUM ('pending_review','routed','excluded','awaiting_confirmation');
CREATE TABLE public.claap_meetings (
 id uuid PRIMARY KEY,claap_id text,title text,started_at timestamptz,matched_at timestamptz,updated_at timestamptz,
 call_type text,status public.claap_meeting_status,match_status text,match_confidence integer,match_source text,
 matched_lender_id uuid,deal_id uuid,recording_url text,ai_summary text,key_decisions text[],next_steps text[],topics text[],
 transcript text,company_id uuid,organizer_id uuid,match_method text,manually_locked boolean,matched_by uuid,match_reason text
);
CREATE TABLE public.claap_meeting_participants (id uuid,meeting_id uuid,name text,email text,domain text,is_internal boolean);
CREATE TABLE public.claap_match_audit (meeting_id uuid,action text,previous_deal_id uuid,new_deal_id uuid,previous_status text,new_status text,match_method text,match_confidence integer,match_reason text,performed_by uuid);
GRANT SELECT,UPDATE ON public.claap_meetings TO authenticated;
GRANT SELECT ON public.claap_meeting_participants TO authenticated;
GRANT SELECT,INSERT ON public.claap_match_audit TO authenticated;
ALTER TABLE public.claap_meetings ENABLE ROW LEVEL SECURITY;
CREATE POLICY meeting_read ON public.claap_meetings FOR SELECT TO authenticated USING (is_company_member(auth.uid(),company_id));
CREATE POLICY meeting_write ON public.claap_meetings FOR UPDATE TO authenticated USING (organizer_id=auth.uid());
ALTER TABLE public.claap_meeting_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY participant_read ON public.claap_meeting_participants FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.claap_meetings m WHERE m.id=meeting_id));
ALTER TABLE public.claap_match_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_insert ON public.claap_match_audit FOR INSERT TO authenticated WITH CHECK (performed_by=auth.uid() AND EXISTS(SELECT 1 FROM public.claap_meetings m WHERE m.id=meeting_id));
CREATE POLICY audit_read ON public.claap_match_audit FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.claap_meetings m WHERE m.id=meeting_id));
\i drizzle/migrations/0063_claap_refresh_mcp.sql
INSERT INTO company_members VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111'),('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222');
INSERT INTO master_lenders(id,user_id,company_id,name) VALUES
 ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Local lender'),
 ('88888888-8888-4888-8888-888888888888','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Second local lender'),
 ('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Other tenant');
INSERT INTO claap_meetings(id,claap_id,title,company_id,organizer_id,status,transcript,ai_summary,updated_at,matched_at) VALUES
 ('55555555-5555-4555-8555-555555555555','local','Local call','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','pending_review','untouched transcript','untouched summary','2026-10-01','2026-11-02'),
 ('66666666-6666-4666-8666-666666666666','other','Other call','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111','pending_review','private transcript','private summary','2026-11-03',NULL);
INSERT INTO claap_meeting_participants VALUES ('77777777-7777-4777-8777-777777777777','55555555-5555-4555-8555-555555555555','Lender','local@example.test','example.test',false);
SET ROLE authenticated;
SELECT set_config('request.user_id','11111111-1111-4111-8111-111111111111',false);
DO $$ DECLARE r jsonb; v text; BEGIN
 FOREACH v IN ARRAY ARRAY['imported','verified_call','verified_email','verified_attachment'] LOOP
  r:=mcp_update_lender('33333333-3333-4333-8333-333333333333',jsonb_build_object('criteria_confidence',v));
  IF r->'lender'->>'criteria_confidence' IS DISTINCT FROM v THEN RAISE EXCEPTION 'Confidence did not persist'; END IF;
 END LOOP;
 PERFORM mcp_update_lender('33333333-3333-4333-8333-333333333333','{"criteria_confidence":null}');
 BEGIN PERFORM mcp_update_lender('33333333-3333-4333-8333-333333333333','{"criteria_confidence":"bogus"}'); RAISE EXCEPTION 'Accepted bogus confidence'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='Accepted bogus confidence' THEN RAISE; END IF; END;
 r:=mcp_list_lender_claap_meetings(p_updated_after=>'2026-11-01');
 IF jsonb_array_length(r->'meetings')<>1 OR r->'meetings'->0 ? 'transcript' OR jsonb_array_length(r->'meetings'->0->'participants')<>1 THEN RAISE EXCEPTION 'Greatest timestamp / RLS / transcript / participants failed'; END IF;
 r:=mcp_list_lender_claap_meetings(p_include_transcript=>true);
 IF r->'meetings'->0->>'transcript'<>'untouched transcript' THEN RAISE EXCEPTION 'Transcript opt-in failed'; END IF;
 PERFORM mcp_update_claap_meeting_match('55555555-5555-4555-8555-555555555555','33333333-3333-4333-8333-333333333333','matched','confirmed','routed');
 IF NOT EXISTS(SELECT 1 FROM claap_meetings WHERE matched_lender_id='33333333-3333-4333-8333-333333333333' AND status='routed' AND match_method='manual' AND manually_locked AND matched_by=auth.uid() AND transcript='untouched transcript' AND ai_summary='untouched summary') THEN RAISE EXCEPTION 'Manual match fields/preservation failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM claap_match_audit WHERE previous_lender_id IS NULL AND new_lender_id='33333333-3333-4333-8333-333333333333' AND new_match_status='matched' AND performed_by=auth.uid()) THEN RAISE EXCEPTION 'Audit missing'; END IF;
 PERFORM mcp_update_claap_meeting_match('55555555-5555-4555-8555-555555555555','88888888-8888-4888-8888-888888888888','needs_review','reassigned');
 IF NOT EXISTS(SELECT 1 FROM claap_match_audit WHERE previous_lender_id='33333333-3333-4333-8333-333333333333' AND new_lender_id='88888888-8888-4888-8888-888888888888' AND new_match_status='needs_review') THEN RAISE EXCEPTION 'Reassign audit failed'; END IF;
 r:=mcp_list_lender_claap_meetings(p_lender_ids=>ARRAY['88888888-8888-4888-8888-888888888888'::uuid],p_match_statuses=>ARRAY['needs_review']);
 IF jsonb_array_length(r->'meetings')<>1 THEN RAISE EXCEPTION 'Lender/status filter failed'; END IF;
 r:=mcp_list_lender_claap_meetings(p_lender_ids=>ARRAY['33333333-3333-4333-8333-333333333333'::uuid]);
 IF jsonb_array_length(r->'meetings')<>0 THEN RAISE EXCEPTION 'Old lender still listed'; END IF;
 BEGIN PERFORM mcp_update_claap_meeting_match('55555555-5555-4555-8555-555555555555','44444444-4444-4444-8444-444444444444','matched'); RAISE EXCEPTION 'Cross tenant target accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM mcp_update_claap_meeting_match('66666666-6666-4666-8666-666666666666',NULL,'unmatched'); RAISE EXCEPTION 'Cross tenant meeting accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM mcp_update_claap_meeting_match('55555555-5555-4555-8555-555555555555',NULL,'unmatched');
 IF NOT EXISTS(SELECT 1 FROM claap_meetings WHERE matched_lender_id IS NULL AND status='routed' AND manually_locked) THEN RAISE EXCEPTION 'Clear/status preservation failed'; END IF;
END $$;
SELECT set_config('request.user_id','22222222-2222-4222-8222-222222222222',false);
DO $$ BEGIN
 BEGIN PERFORM mcp_update_claap_meeting_match('55555555-5555-4555-8555-555555555555',NULL,'unmatched'); RAISE EXCEPTION 'Nonorganizer write accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
REVOKE INSERT ON claap_match_audit FROM authenticated;
SET ROLE authenticated;
SELECT set_config('request.user_id','11111111-1111-4111-8111-111111111111',false);
DO $$ BEGIN
 BEGIN PERFORM mcp_update_claap_meeting_match('55555555-5555-4555-8555-555555555555','33333333-3333-4333-8333-333333333333','matched'); RAISE EXCEPTION 'Audit failure ignored'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF EXISTS(SELECT 1 FROM claap_meetings WHERE matched_lender_id IS NOT NULL) THEN RAISE EXCEPTION 'Audit failure did not rollback'; END IF;
END $$;
RESET ROLE;
INSERT INTO claap_meetings(id,claap_id,company_id,organizer_id,status,updated_at) VALUES
 ('99999999-9999-4999-8999-999999999999','second','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','pending_review','2026-10-01');
SET ROLE authenticated;
DO $$ DECLARE r jsonb; first_id text; BEGIN
 r:=mcp_list_lender_claap_meetings(p_limit=>1);
 IF (r->>'has_more')::boolean IS DISTINCT FROM true OR (r->>'next_offset')::int<>1 THEN RAISE EXCEPTION 'First page failed'; END IF;
 first_id:=r->'meetings'->0->>'id';
 r:=mcp_list_lender_claap_meetings(p_limit=>1,p_offset=>1);
 IF (r->>'has_more')::boolean OR r->'meetings'->0->>'id'=first_id THEN RAISE EXCEPTION 'Second page failed'; END IF;
END $$;
RESET ROLE;
SELECT 'Claap refresh isolated assertions passed' AS result;