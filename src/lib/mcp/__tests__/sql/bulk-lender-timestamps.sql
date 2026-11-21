-- Run ONLY in a fresh isolated PostgreSQL database, never against the app database.
DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.user_id',true),'')::uuid $$;
CREATE TABLE deals(id uuid PRIMARY KEY,company_id uuid,user_id uuid);
CREATE TABLE master_lenders(id uuid PRIMARY KEY,company_id uuid,name text);
CREATE TABLE lender_contacts(id uuid,lender_id uuid);
CREATE TABLE deal_lenders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),deal_id uuid,master_lender_id uuid,name text,stage text,substage text,tracking_status text,notes text,pass_reason text,selected_contact_id uuid,tags text[],quote_amount numeric,quote_rate numeric,quote_term text,submitted_at timestamptz,approved_at timestamptz,passed_at timestamptz,declined_at timestamptz,excluded_at timestamptz,on_hold_at timestamptz,on_deck_at timestamptz,last_status_change_at timestamptz,updated_at timestamptz DEFAULT now());
CREATE TABLE lender_notes_history(deal_lender_id uuid,text text);
CREATE TABLE deal_activity(deal_id uuid,user_id uuid,source text,action_type text,before jsonb,after jsonb);
CREATE FUNCTION _deal_lender_status_bucket(text,text,text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT CASE $1 WHEN 'active' THEN 'submitted' WHEN 'on-deck' THEN 'on_deck' ELSE 'approved' END $$;
GRANT USAGE ON SCHEMA public,auth TO authenticated;
GRANT SELECT ON deals,master_lenders,lender_contacts TO authenticated;
GRANT SELECT,INSERT,UPDATE ON deal_lenders TO authenticated;
GRANT SELECT,INSERT ON deal_activity,lender_notes_history TO authenticated;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner ON deals FOR SELECT TO authenticated USING(user_id=auth.uid());
ALTER TABLE deal_lenders ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner ON deal_lenders FOR ALL TO authenticated USING(EXISTS(SELECT FROM deals WHERE id=deal_id)) WITH CHECK(EXISTS(SELECT FROM deals WHERE id=deal_id));
ALTER TABLE deal_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner ON deal_activity FOR ALL TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid() AND EXISTS(SELECT FROM deals WHERE id=deal_id));
\i drizzle/migrations/0096_mcp_deal_lender_historical_writes.sql
\i drizzle/migrations/0099_bulk_deal_lender_timestamp_overrides.sql
INSERT INTO deals VALUES('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333');
INSERT INTO master_lenders VALUES('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222','Fixture lender'),('55555555-5555-4555-8555-555555555555','22222222-2222-4222-8222-222222222222','New fixture');
INSERT INTO deal_lenders(deal_id,master_lender_id,name,stage,tracking_status,submitted_at,on_deck_at) VALUES('11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444','Fixture lender','active','active','2026-01-01T00:00:00Z','2025-12-01T00:00:00Z');
CREATE TRIGGER status_timestamps BEFORE INSERT OR UPDATE ON deal_lenders FOR EACH ROW EXECUTE FUNCTION deal_lenders_set_status_timestamps();
SET ROLE authenticated;
SET request.user_id='33333333-3333-4333-8333-333333333333';
DO $$ DECLARE item jsonb:='{"deal_id":"11111111-1111-4111-8111-111111111111","lender_id":"44444444-4444-4444-8444-444444444444","stage":"active","timestamps":{"submitted_at":"2026-10-15T12:00:00Z","approved_at":null,"last_status_change_at":null}}'; r jsonb; k text; original jsonb; BEGIN
 SELECT to_jsonb(d) INTO original FROM deal_lenders d;
 r:=mcp_bulk_upsert_deal_lenders(jsonb_build_array(item),'upsert',true);
 IF r->0->>'outcome'<>'would_update' OR (SELECT to_jsonb(d) FROM deal_lenders d)<>original OR (SELECT count(*) FROM deal_activity)<>0 THEN RAISE EXCEPTION 'Same-stage timestamp preview must be would_update without writes'; END IF;
 r:=mcp_bulk_upsert_deal_lenders(jsonb_build_array(item),'upsert',false);
 IF r->0->>'outcome'<>'updated' OR (SELECT submitted_at FROM deal_lenders)<>'2026-10-15T12:00:00Z'::timestamptz OR (SELECT on_deck_at FROM deal_lenders)<>'2025-12-01T00:00:00Z'::timestamptz OR (SELECT last_status_change_at FROM deal_lenders) IS NOT NULL THEN RAISE EXCEPTION 'Explicit dates/null/omitted dates failed'; END IF;
 IF (SELECT before->>'submitted_at' FROM deal_activity LIMIT 1) IS NULL OR (SELECT after->>'submitted_at' FROM deal_activity LIMIT 1) IS NULL THEN RAISE EXCEPTION 'Timestamp before/after activity missing'; END IF;
 FOREACH k IN ARRAY ARRAY['submitted_at','approved_at','passed_at','declined_at','excluded_at','on_hold_at','on_deck_at','last_status_change_at'] LOOP
   item:=jsonb_set(item,'{timestamps}',jsonb_build_object(k,'2026-10-15T12:00:00-05:00'));
   r:=mcp_bulk_upsert_deal_lenders(jsonb_build_array(item),'upsert',false);
   IF r->0->>'outcome'<>'updated' OR (SELECT (to_jsonb(d)->>k)::timestamptz FROM deal_lenders d)<>'2026-10-15T17:00:00Z'::timestamptz THEN RAISE EXCEPTION 'Timestamp % did not update', k; END IF;
   item:=jsonb_set(item,'{timestamps}',jsonb_build_object(k,NULL));
   r:=mcp_bulk_upsert_deal_lenders(jsonb_build_array(item),'upsert',false);
   IF r->0->>'outcome'<>'updated' OR (SELECT to_jsonb(d)->>k FROM deal_lenders d) IS NOT NULL THEN RAISE EXCEPTION 'Timestamp % did not clear', k; END IF;
 END LOOP;
 item:=item-'timestamps';
 r:=mcp_bulk_upsert_deal_lenders(jsonb_build_array(item),'upsert',false);
 IF r->0->>'outcome'<>'skipped_same' THEN RAISE EXCEPTION 'Legacy unchanged row should still skip'; END IF;
 item:=item||'{"timestamps":{"submitted_at":"2026-10-15T12:00:00Z"}}'::jsonb;
 r:=mcp_bulk_upsert_deal_lenders(jsonb_build_array(item),'insert_only',false);
 IF r->0->>'outcome'<>'skipped_existing' THEN RAISE EXCEPTION 'insert_only must not edit'; END IF;
 item:=item||'{"stage":"approved","status_date":"2026-01-01T00:00:00Z","timestamps":{"approved_at":null,"last_status_change_at":"2026-10-15T12:00:00Z"}}'::jsonb;
 r:=mcp_bulk_upsert_deal_lenders(jsonb_build_array(item),'upsert',false);
 IF r->0->>'outcome'<>'updated' OR (SELECT approved_at FROM deal_lenders) IS NOT NULL OR (SELECT last_status_change_at FROM deal_lenders)<>'2026-10-15T12:00:00Z'::timestamptz THEN RAISE EXCEPTION 'Explicit dates must override inferred status_date'; END IF;
 item:=item||'{"lender_id":"55555555-5555-4555-8555-555555555555"}'::jsonb;
 r:=mcp_bulk_upsert_deal_lenders(jsonb_build_array(item),'upsert',false);
 IF r->0->>'outcome'<>'inserted' OR (SELECT approved_at FROM deal_lenders WHERE master_lender_id='55555555-5555-4555-8555-555555555555') IS NOT NULL THEN RAISE EXCEPTION 'Insert timestamp overrides failed'; END IF;
 item:=jsonb_set(item,'{timestamps}','{"submitted_at":"yesterday"}');
 r:=mcp_bulk_upsert_deal_lenders(jsonb_build_array(item),'upsert',true);
 IF r->0->>'outcome'<>'error' THEN RAISE EXCEPTION 'Malformed timestamp accepted during preview'; END IF;
 item:=jsonb_set(item,'{timestamps}','{"created_at":null}');
 r:=mcp_bulk_upsert_deal_lenders(jsonb_build_array(item),'upsert',true);
 IF r->0->>'outcome'<>'error' THEN RAISE EXCEPTION 'Unauthorized timestamp column accepted'; END IF;
 RAISE NOTICE 'Same-stage dates, all eight fields, null clears, preservation, preview, insert_only, insertion and validation passed';
END $$;
SET request.user_id='66666666-6666-4666-8666-666666666666';
DO $$ DECLARE r jsonb; BEGIN
 r:=mcp_bulk_upsert_deal_lenders('[{"deal_id":"11111111-1111-4111-8111-111111111111","lender_id":"44444444-4444-4444-8444-444444444444","timestamps":{"submitted_at":null}}]','upsert',false);
 IF r->0->>'outcome'<>'error' THEN RAISE EXCEPTION 'Unauthorized caller updated timestamps'; END IF;
END $$;