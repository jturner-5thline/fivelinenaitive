-- Isolated PostgreSQL only. NEVER run this fixture against the application database.
CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.user_id',true),'')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('email',current_setting('request.email',true)) $$;
GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;
CREATE TABLE company_members(user_id uuid,company_id uuid);
INSERT INTO company_members VALUES ('11111111-1111-4111-8111-111111111111','44556c46-9127-4b12-b14e-d6fee784afcf'),('22222222-2222-4222-8222-222222222222','44556c46-9127-4b12-b14e-d6fee784afcf');
GRANT SELECT ON company_members TO authenticated;
CREATE TABLE insights_metric_targets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,owner_user_id uuid,metric_key text,metric_label text,period_month text,target_value numeric,notes text,updated_at timestamptz DEFAULT now(),UNIQUE(company_id,metric_key,period_month));
CREATE TABLE monthly_entity_headcount(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,realm_id text,month date,headcount numeric,notes text,updated_by uuid,updated_at timestamptz DEFAULT now(),UNIQUE(company_id,realm_id,month));
GRANT SELECT,INSERT,UPDATE,DELETE ON insights_metric_targets TO authenticated;
GRANT SELECT,INSERT,UPDATE ON monthly_entity_headcount TO authenticated;
ALTER TABLE insights_metric_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_entity_headcount ENABLE ROW LEVEL SECURITY;
CREATE POLICY plan_access ON insights_metric_targets TO authenticated USING(EXISTS(SELECT 1 FROM company_members cm WHERE cm.user_id=auth.uid() AND cm.company_id=insights_metric_targets.company_id)) WITH CHECK(EXISTS(SELECT 1 FROM company_members cm WHERE cm.user_id=auth.uid() AND cm.company_id=insights_metric_targets.company_id));
CREATE POLICY hc_access ON monthly_entity_headcount TO authenticated USING(EXISTS(SELECT 1 FROM company_members cm WHERE cm.user_id=auth.uid() AND cm.company_id=monthly_entity_headcount.company_id)) WITH CHECK(EXISTS(SELECT 1 FROM company_members cm WHERE cm.user_id=auth.uid() AND cm.company_id=monthly_entity_headcount.company_id));