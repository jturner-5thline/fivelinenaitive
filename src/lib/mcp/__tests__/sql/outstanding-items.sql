-- ONLY run in a disposable local PostgreSQL database. All records below are synthetic.
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.user_id',true),'')::uuid $$;
GRANT USAGE ON SCHEMA public,auth TO authenticated;
CREATE TABLE deals(id uuid PRIMARY KEY,user_id uuid);
CREATE TABLE deal_lenders(id uuid PRIMARY KEY,deal_id uuid REFERENCES deals,name text);
CREATE TABLE outstanding_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),deal_id uuid NOT NULL REFERENCES deals,lender_id uuid REFERENCES deal_lenders,description text NOT NULL,status text NOT NULL DEFAULT 'pending',priority text NOT NULL DEFAULT 'normal',due_date date,eta date,assigned_to text,notes text,user_id uuid,position integer NOT NULL DEFAULT 0,source_metadata jsonb,is_archived boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE activity_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),deal_id uuid NOT NULL REFERENCES deals,user_id uuid,user_display_name text,activity_type text NOT NULL,description text NOT NULL,metadata jsonb);
GRANT SELECT ON deals,deal_lenders TO authenticated;
GRANT SELECT,INSERT,UPDATE ON outstanding_items TO authenticated;
GRANT SELECT,INSERT ON activity_logs TO authenticated;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_lenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE outstanding_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY access ON deals TO authenticated USING(user_id=auth.uid());
CREATE POLICY access ON deal_lenders TO authenticated USING(EXISTS(SELECT 1 FROM deals WHERE id=deal_id));
CREATE POLICY access ON outstanding_items TO authenticated USING(EXISTS(SELECT 1 FROM deals WHERE id=deal_id)) WITH CHECK(EXISTS(SELECT 1 FROM deals WHERE id=deal_id));
CREATE POLICY access ON activity_logs TO authenticated USING(EXISTS(SELECT 1 FROM deals WHERE id=deal_id)) WITH CHECK(EXISTS(SELECT 1 FROM deals WHERE id=deal_id));
INSERT INTO deals VALUES('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO deal_lenders VALUES('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','Synthetic Lender'),('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222','Other tenant');
\i docs/sql/outstanding-items-mcp.sql
SET ROLE authenticated;
SELECT set_config('request.user_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
DO $$
DECLARE r jsonb; r2 jsonb; id uuid; d uuid := '11111111-1111-4111-8111-111111111111'; n integer;
BEGIN
 r := mcp_write_outstanding_item('create',d,NULL,'{"description":"Statements","lender_id":"33333333-3333-4333-8333-333333333333","idempotency_key":"repeat","source_metadata":{"unknown":"safe"}}');
 id := (r->'item'->>'id')::uuid;
 ASSERT r->>'created'='true'; ASSERT r->'item'->>'position'='0'; ASSERT r->'item'->>'priority'='normal'; ASSERT r->'item'->>'user_id'=auth.uid()::text;
 ASSERT (r->'item'->>'status')::jsonb->'requestedBy'='["Synthetic Lender"]'::jsonb;
 r2 := mcp_write_outstanding_item('create',d,NULL,'{"description":"Retry","idempotency_key":"repeat"}');
 ASSERT r2->>'created'='false'; ASSERT r2->'item'->>'id'=id::text;
 r2 := mcp_write_outstanding_item('create',d,NULL,'{"description":"No lender","notes":"Original"}'); ASSERT r2->'item'->>'position'='1'; ASSERT r2->'item'->'lender_id'='null'::jsonb;
 r := mcp_write_outstanding_item('update',NULL,id,'{"status":"received","source_metadata_merge":{"email_thread_id":"thread"}}');
 ASSERT (r->'item'->>'status')::jsonb->'received'='true'::jsonb; ASSERT (r->'item'->>'status')::jsonb->'approved'='false'::jsonb;
 ASSERT r->'item'->'source_metadata'->>'unknown'='safe'; ASSERT r->'item'->'source_metadata'->>'idempotency_key'='repeat';
 ASSERT mcp_list_outstanding_items(d,'{"open_only":true}')->>'total_count'='2';
 r := mcp_write_outstanding_item('update',NULL,id,'{"status":"submitted","notes":"Original"}');
 ASSERT mcp_list_outstanding_items(d,'{"open_only":true}')->>'total_count'='1';
 ASSERT mcp_list_outstanding_items(d,'{}')->>'total_count'='2';
 r := mcp_write_outstanding_item('update',NULL,id,'{"append_note":"Asked again"}');
 ASSERT r->'item'->>'notes'='Original'||E'\n'||to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD')||': Asked again';
 ASSERT (r->'item'->>'status')::jsonb->'requestedBy'='["Synthetic Lender"]'::jsonb;
 r := mcp_write_outstanding_item('update',NULL,id,'{"is_archived":true}');
 ASSERT mcp_list_outstanding_items(d,'{}')->>'total_count'='1';
 ASSERT mcp_list_outstanding_items(d,'{"include_archived":true}')->>'total_count'='2';
 ASSERT mcp_write_outstanding_item('create',d,NULL,'{"description":"Retry archived","idempotency_key":"repeat"}')->>'created'='false';
 ASSERT mcp_list_outstanding_items(d,'{"include_archived":true,"limit":1}')->>'has_more'='true';
 ASSERT mcp_list_outstanding_items(d,'{"include_archived":true,"limit":1,"offset":1}')->>'has_more'='false';
 SELECT count(*) INTO n FROM outstanding_items;
 BEGIN PERFORM mcp_write_outstanding_item('create',d,NULL,'{"description":"Bad lender","lender_id":"44444444-4444-4444-8444-444444444444"}'); RAISE EXCEPTION 'should deny lender'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 ASSERT (SELECT count(*) FROM outstanding_items)=n;
 BEGIN PERFORM mcp_write_outstanding_item('create','22222222-2222-4222-8222-222222222222',NULL,'{"description":"Cross tenant"}'); RAISE EXCEPTION 'should deny deal'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM mcp_write_outstanding_item('update',NULL,id,'{"source_metadata_merge":{"idempotency_key":"changed"}}'); RAISE EXCEPTION 'should protect key'; EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='An item idempotency key cannot be changed'; END;
 ASSERT (SELECT count(*) FROM activity_logs)=6;
END $$;
RESET ROLE;
-- A failed required activity insert must roll back the item mutation.
CREATE FUNCTION fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit blocked'; END $$;
CREATE TRIGGER fail_audit BEFORE INSERT ON activity_logs FOR EACH ROW EXECUTE FUNCTION fail_audit();
SET ROLE authenticated;
DO $$ DECLARE n integer; BEGIN
 SELECT count(*) INTO n FROM outstanding_items;
 BEGIN PERFORM mcp_write_outstanding_item('create','11111111-1111-4111-8111-111111111111',NULL,'{"description":"Rollback"}'); EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='audit blocked'; END;
 ASSERT (SELECT count(*) FROM outstanding_items)=n;
END $$;
SELECT set_config('request.user_id','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
DO $$ BEGIN
 BEGIN PERFORM mcp_list_outstanding_items('11111111-1111-4111-8111-111111111111','{}'); RAISE EXCEPTION 'should deny list'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM mcp_write_outstanding_item('update',NULL,(SELECT id FROM outstanding_items LIMIT 1),'{}'); RAISE EXCEPTION 'should deny update'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'Open Items isolated assertions passed';
