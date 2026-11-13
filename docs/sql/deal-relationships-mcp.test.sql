-- Run only against an isolated empty PostgreSQL database, never the hosted database.
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE TABLE public.deals(id uuid PRIMARY KEY,company_id uuid,user_id uuid,crm_company_id uuid,pipeline_id uuid,stage text,value numeric,closing_date date,deal_owner text,manager text,narrative text,is_flagged boolean,flag_notes text,notes text,updated_at timestamptz DEFAULT now());
CREATE TABLE public.contacts(id uuid PRIMARY KEY,org_company_id uuid,crm_company_id uuid,first_name text,last_name text,full_name text,email text);
CREATE TABLE public.crm_companies(id uuid PRIMARY KEY,org_company_id uuid,name text,domain text);
CREATE TABLE public.contact_deals(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),deal_id uuid,contact_id uuid,role text,created_at timestamptz DEFAULT now(),UNIQUE(contact_id,deal_id));
CREATE TABLE public.deal_aliases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),deal_id uuid,alias text,alias_normalized text,created_by uuid,created_at timestamptz DEFAULT now(),UNIQUE(deal_id,alias_normalized));
CREATE TABLE public.deal_activity(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),deal_id uuid,user_id uuid,source text,action_type text,before jsonb,after jsonb);
CREATE TABLE public.deal_pipelines(id uuid PRIMARY KEY,company_id uuid,name text,stages jsonb);
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY scoped ON public.deals TO authenticated USING(company_id=auth.uid()) WITH CHECK(company_id=auth.uid());
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY scoped ON public.contacts TO authenticated USING(org_company_id=auth.uid());
ALTER TABLE public.crm_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY scoped ON public.crm_companies TO authenticated USING(org_company_id=auth.uid());
ALTER TABLE public.deal_pipelines ENABLE ROW LEVEL SECURITY;
CREATE POLICY scoped ON public.deal_pipelines TO authenticated USING(company_id=auth.uid());
\ir ../../drizzle/migrations/0071_mcp_deal_relationships.sql
-- Load the existing pipeline operation, without its unrelated history trigger function.
CREATE OR REPLACE FUNCTION public.mcp_update_deal_pipeline(p_deal_id uuid, p_pipeline_id uuid, p_patch jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
 v_before public.deals; v_after public.deals; v_values public.deals; v_target public.deal_pipelines;
 v_old_name text; v_old_label text; v_stage jsonb; v_matches integer; v_input text; v_key text; v_context text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
 IF p_pipeline_id IS NULL THEN RAISE EXCEPTION 'pipeline_id is required'; END IF;
 IF p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' THEN RAISE EXCEPTION 'Invalid update fields'; END IF;
 v_input:=btrim(p_patch->>'stage');
 IF v_input IS NULL OR v_input='' THEN RAISE EXCEPTION 'stage is required when pipeline_id is passed'; END IF;
 FOR v_key IN SELECT jsonb_object_keys(p_patch) LOOP
  IF v_key NOT IN ('stage','value','closing_date','deal_owner','manager','narrative','is_flagged','flag_notes') THEN RAISE EXCEPTION 'Unsupported update field: %',v_key; END IF;
 END LOOP;
 SELECT * INTO v_before FROM public.deals WHERE id=p_deal_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Deal not found or you do not have permission to update it' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_target FROM public.deal_pipelines WHERE id=p_pipeline_id FOR SHARE;
 IF NOT FOUND OR v_target.company_id IS DISTINCT FROM v_before.company_id THEN RAISE EXCEPTION 'Target pipeline not found or you do not have access to it in this deal workspace' USING ERRCODE='42501'; END IF;
 SELECT s INTO v_stage FROM jsonb_array_elements(v_target.stages) s WHERE s->>'id'=v_input;
 IF v_stage IS NULL THEN
  SELECT count(*) INTO v_matches FROM jsonb_array_elements(v_target.stages) s WHERE lower(btrim(s->>'label'))=lower(v_input);
  IF v_matches>1 THEN RAISE EXCEPTION 'Ambiguous stage label in target pipeline; use a stage id'; END IF;
  SELECT s INTO v_stage FROM jsonb_array_elements(v_target.stages) s WHERE lower(btrim(s->>'label'))=lower(v_input);
 END IF;
 IF v_stage IS NULL OR coalesce(v_stage->>'id','')='' THEN RAISE EXCEPTION 'Stage "%" does not exist in target pipeline "%"',v_input,v_target.name; END IF;
 SELECT name,(SELECT s->>'label' FROM jsonb_array_elements(stages) s WHERE s->>'id'=v_before.stage) INTO v_old_name,v_old_label FROM public.deal_pipelines WHERE id=v_before.pipeline_id;
 v_values:=jsonb_populate_record(v_before,p_patch || jsonb_build_object('stage',v_stage->>'id'));
 v_context:=current_setting('naitive.mcp_pipeline_move',true);
 PERFORM set_config('naitive.mcp_pipeline_move','true',true);
 UPDATE public.deals SET pipeline_id=p_pipeline_id,stage=v_values.stage,value=v_values.value,closing_date=v_values.closing_date,deal_owner=v_values.deal_owner,manager=v_values.manager,narrative=v_values.narrative,is_flagged=v_values.is_flagged,flag_notes=v_values.flag_notes,updated_at=now() WHERE id=p_deal_id RETURNING * INTO v_after;
 IF NOT FOUND THEN RAISE EXCEPTION 'You do not have permission to update this deal' USING ERRCODE='42501'; END IF;
 PERFORM set_config('naitive.mcp_pipeline_move',coalesce(v_context,''),true);
 IF v_before.pipeline_id IS DISTINCT FROM v_after.pipeline_id OR v_before.stage IS DISTINCT FROM v_after.stage THEN
  INSERT INTO public.deal_activity(deal_id,user_id,source,action_type,before,after) VALUES(p_deal_id,auth.uid(),'mcp update_deal',CASE WHEN v_before.pipeline_id IS DISTINCT FROM v_after.pipeline_id THEN 'pipeline_changed' ELSE 'stage_changed' END,jsonb_build_object('pipeline_id',v_before.pipeline_id,'pipeline_name',v_old_name,'stage',v_before.stage,'stage_label',coalesce(v_old_label,v_before.stage)),jsonb_build_object('pipeline_id',v_after.pipeline_id,'pipeline_name',v_target.name,'stage',v_after.stage,'stage_label',coalesce(v_stage->>'label',v_after.stage)));
 END IF;
 RETURN to_jsonb(v_after) || jsonb_build_object('pipeline_name',v_target.name,'stage_label',coalesce(v_stage->>'label',v_after.stage));
END; $$;
REVOKE ALL ON FUNCTION public.mcp_update_deal_pipeline(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mcp_update_deal_pipeline(uuid,uuid,jsonb) TO authenticated;


INSERT INTO deals(id,company_id,stage) VALUES ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','initial');
INSERT INTO crm_companies VALUES ('33333333-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Example Company','example.com'),('44444444-4444-4444-8444-444444444444','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Other tenant','other.com');
INSERT INTO contacts VALUES('22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','Jane','Doe',NULL,'jane@example.com'),('55555555-5555-4555-8555-555555555555','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',NULL,'Other','Person',NULL,'other@example.com');
INSERT INTO deal_pipelines VALUES('66666666-6666-4666-8666-666666666666','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','In Development','[{"id":"on-hold","label":"Benched"}]');
SET ROLE authenticated;
SELECT set_config('test.uid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
DO $$
DECLARE d uuid:='11111111-1111-4111-8111-111111111111'; r jsonb; n int; t timestamptz;
BEGIN
 r:=mcp_mutate_deal_relationship(d,'link_deal_contact','{"email":"JANE@example.com","role":"Client – CFO"}');
 IF NOT (r->>'changed')::boolean OR r#>>'{contact,name}'<>'Jane Doe' OR r#>>'{contact,company,name}'<>'Example Company' THEN RAISE EXCEPTION 'link response failed'; END IF;
 r:=mcp_mutate_deal_relationship(d,'link_deal_contact','{"contact_id":"22222222-2222-4222-8222-222222222222","role":"Client – CFO"}');
 IF (r->>'changed')::boolean OR (SELECT count(*) FROM contact_deals)<>1 OR (SELECT count(*) FROM deal_activity)<>1 THEN RAISE EXCEPTION 'link retry duplicated'; END IF;
 r:=mcp_mutate_deal_relationship(d,'link_deal_contact','{"email":"jane@example.com"}');
 IF r#>>'{link,role}'<>'Client – CFO' THEN RAISE EXCEPTION 'omitted role not preserved'; END IF;
 r:=mcp_mutate_deal_relationship(d,'link_deal_contact','{"email":"jane@example.com","role":"Client – Owner"}');
 IF r#>>'{link,role}'<>'Client – Owner' THEN RAISE EXCEPTION 'role not updated'; END IF;
 BEGIN PERFORM mcp_mutate_deal_relationship(d,'link_deal_contact','{"email":"missing@example.com"}'); RAISE EXCEPTION 'missing contact accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM mcp_mutate_deal_relationship(d,'link_deal_contact','{"contact_id":"55555555-5555-4555-8555-555555555555"}'); RAISE EXCEPTION 'foreign contact accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM mcp_mutate_deal_relationship(d,'unlink_deal_contact','{"email":"jane@example.com"}');
 SELECT count(*) INTO n FROM deal_activity;
 r:=mcp_mutate_deal_relationship(d,'unlink_deal_contact','{"email":"jane@example.com"}');
 IF (r->>'changed')::boolean OR (SELECT count(*) FROM deal_activity)<>n OR (SELECT count(*) FROM contacts)<>1 THEN RAISE EXCEPTION 'unlink retry/contact deletion failed'; END IF;
 r:=mcp_mutate_deal_relationship(d,'add_deal_alias',jsonb_build_object('alias',E'  Sample\t Company  '));
 IF r->>'alias_normalized'<>'sample company' THEN RAISE EXCEPTION 'alias normalization failed'; END IF;
 SELECT count(*) INTO n FROM deal_activity;
 r:=mcp_mutate_deal_relationship(d,'add_deal_alias','{"alias":"SAMPLE   COMPANY"}');
 IF (r->>'changed')::boolean OR (SELECT count(*) FROM deal_aliases)<>1 OR (SELECT count(*) FROM deal_activity)<>n THEN RAISE EXCEPTION 'alias retry duplicated'; END IF;
 PERFORM mcp_mutate_deal_relationship(d,'remove_deal_alias','{"alias":"sample company"}');
 SELECT count(*) INTO n FROM deal_activity;
 r:=mcp_mutate_deal_relationship(d,'remove_deal_alias','{"alias":"sample company"}');
 IF (r->>'changed')::boolean OR (SELECT count(*) FROM deal_activity)<>n THEN RAISE EXCEPTION 'alias removal retry duplicated'; END IF;
 BEGIN PERFORM mcp_update_deal_company(d,'44444444-4444-4444-8444-444444444444',NULL,'{}'); RAISE EXCEPTION 'foreign company accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM mcp_update_deal_company(d,'33333333-3333-4333-8333-333333333333','66666666-6666-4666-8666-666666666666','{"stage":"Benched"}');
 IF (SELECT stage FROM deals WHERE id=d)<>'on-hold' THEN RAISE EXCEPTION 'target stage resolution failed'; END IF;
 SELECT count(*) INTO n FROM deal_activity; SELECT updated_at INTO t FROM deals WHERE id=d;
 PERFORM mcp_update_deal_company(d,'33333333-3333-4333-8333-333333333333','66666666-6666-4666-8666-666666666666','{"stage":"Benched"}');
 IF (SELECT count(*) FROM deal_activity)<>n OR (SELECT updated_at FROM deals WHERE id=d) IS DISTINCT FROM t THEN RAISE EXCEPTION 'company pipeline retry wrote data'; END IF;
 BEGIN PERFORM mcp_update_deal_company(d,'33333333-3333-4333-8333-333333333333','66666666-6666-4666-8666-666666666666','{"stage":"invalid"}'); RAISE EXCEPTION 'invalid stage accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='invalid stage accepted' THEN RAISE; END IF; END;
 PERFORM set_config('test.uid','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
 BEGIN PERFORM mcp_mutate_deal_relationship(d,'add_deal_alias','{"alias":"forbidden"}'); RAISE EXCEPTION 'foreign deal accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('test.uid','',true);
 BEGIN PERFORM mcp_mutate_deal_relationship(d,'add_deal_alias','{"alias":"forbidden"}'); RAISE EXCEPTION 'unauthenticated accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
CREATE FUNCTION reject_activity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit blocked'; END $$;
CREATE TRIGGER reject_activity BEFORE INSERT ON deal_activity FOR EACH ROW EXECUTE FUNCTION reject_activity();
SET ROLE authenticated;
SELECT set_config('test.uid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
DO $$ BEGIN
 BEGIN PERFORM mcp_mutate_deal_relationship('11111111-1111-4111-8111-111111111111','add_deal_alias','{"alias":"rollback"}'); EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'audit blocked' THEN RAISE; END IF; END;
 IF EXISTS(SELECT 1 FROM deal_aliases WHERE alias_normalized='rollback') THEN RAISE EXCEPTION 'audit failure did not roll back'; END IF;
END $$;
SELECT 'Isolated relationship assertions passed' AS result;
