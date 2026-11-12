-- Isolated PostgreSQL fixture only; NEVER run against the application database.
CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.user_id',true),'')::uuid $$;
CREATE TABLE deals(id uuid PRIMARY KEY, company_id uuid,user_id uuid,pipeline_id uuid,stage text,value numeric,closing_date date,deal_owner text,manager text,narrative text,is_flagged boolean,flag_notes text,updated_at timestamptz,created_at timestamptz);
CREATE TABLE deal_pipelines(id uuid PRIMARY KEY,company_id uuid,name text,stages jsonb);
CREATE TABLE deal_activity(deal_id uuid,user_id uuid,source text,action_type text,before jsonb,after jsonb);
CREATE TABLE deal_stage_history(deal_id uuid,company_id uuid,pipeline_id uuid,from_stage text,to_stage text,changed_at timestamptz,changed_by uuid,source text,from_stage_label_raw text,to_stage_label_raw text);
GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
GRANT SELECT,UPDATE ON deals TO authenticated;
GRANT SELECT,UPDATE ON deal_pipelines TO authenticated;
GRANT INSERT,SELECT ON deal_activity TO authenticated;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY deals_access ON deals TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
ALTER TABLE deal_pipelines ENABLE ROW LEVEL SECURITY;
CREATE POLICY pipeline_access ON deal_pipelines FOR SELECT TO authenticated USING(company_id='11111111-1111-4111-8111-111111111111');
CREATE POLICY pipeline_lock_access ON deal_pipelines FOR UPDATE TO authenticated USING(company_id='11111111-1111-4111-8111-111111111111');
INSERT INTO deal_pipelines VALUES
 ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','Active Deals','[{"id":"on-hold","label":"Active hold"},{"id":"active-only","label":"Only active"}]'),
 ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','In Development','[{"id":"on-hold","label":"Benched"},{"id":"other","label":"Other"}]'),
 ('44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','Private','[{"id":"on-hold","label":"Private"}]');
INSERT INTO deals VALUES('66666666-6666-4666-8666-666666666666','11111111-1111-4111-8111-111111111111','77777777-7777-4777-8777-777777777777','22222222-2222-4222-8222-222222222222','on-hold',10,null,null,null,'unchanged',false,null,now(),now());