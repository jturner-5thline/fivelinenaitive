-- Run only on a fresh isolated PostgreSQL 17 database, never the app database.
CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.user_id',true),'')::uuid $$;
CREATE TABLE public.deals(id uuid PRIMARY KEY,company_id uuid,user_id uuid,value numeric,total_fee numeric GENERATED ALWAYS AS (coalesce(value,0)*coalesce(success_fee_percent,0)/100) STORED,retainer_fee numeric,milestone_fee numeric,success_fee_percent numeric,exclusivity text,contract_start_date date,contract_end_date date,updated_at timestamptz DEFAULT now());
CREATE FUNCTION public.can_access_deal(u uuid,d uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM deals WHERE id=d AND user_id=u) $$;
CREATE TABLE public.deal_audit_log(id uuid DEFAULT gen_random_uuid(),deal_id uuid,user_id uuid,action_type text,entity_type text,entity_id text,entity_name text,metadata jsonb,source text);
CREATE TABLE public.deal_activity(id uuid DEFAULT gen_random_uuid(),deal_id uuid,user_id uuid,source text,action_type text,before jsonb,after jsonb);
GRANT USAGE ON SCHEMA public,auth TO authenticated;
GRANT SELECT,UPDATE ON deals TO authenticated;
GRANT SELECT,INSERT ON deal_audit_log,deal_activity TO authenticated;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner ON deals FOR ALL TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
ALTER TABLE deal_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_read ON deal_audit_log FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY audit_write ON deal_audit_log FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND can_access_deal(auth.uid(),deal_id));
ALTER TABLE deal_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY activity_read ON deal_activity FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY activity_write ON deal_activity FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND can_access_deal(auth.uid(),deal_id));
\i drizzle/migrations/0095_create_deal_qualifiers.sql
\i drizzle/migrations/0097_agreement_terms_fees_qualifiers.sql
\i drizzle/migrations/0098_harden_agreement_criterion_validation.sql
INSERT INTO deals(id,company_id,user_id,value,retainer_fee,milestone_fee,success_fee_percent) VALUES('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',1000000,2500,5000,1.5);
SET ROLE authenticated;
SET request.user_id='33333333-3333-4333-8333-333333333333';
DO $$ DECLARE d uuid:='11111111-1111-4111-8111-111111111111'; r jsonb; a jsonb; original jsonb; cnt integer; stamp timestamptz; BEGIN
 IF get_deal_qualifiers_record(d) IS NOT NULL THEN RAISE EXCEPTION 'Missing agreement must return null'; END IF;
 r:=update_deal_fees(d,'{"success_fee_minimum":20000}','test','minimum',NULL,true);
 IF r->'diffs'->'success_fee_minimum'->>'new'<>'20000' OR (SELECT success_fee_minimum FROM deals WHERE id=d) IS NOT NULL OR (SELECT count(*) FROM deal_audit_log)<>0 THEN RAISE EXCEPTION 'Fee preview wrote data or wrong diff'; END IF;
 SELECT updated_at INTO stamp FROM deals WHERE id=d;
 r:=update_deal_fees(d,'{"success_fee_minimum":20000}','test','minimum',stamp,false);
 IF (r->'record'->>'total_fee')::numeric<>20000 OR (SELECT count(*) FROM deal_audit_log)<>1 OR (SELECT count(*) FROM deal_activity)<>1 THEN RAISE EXCEPTION 'Fee math/audit failed'; END IF;
 IF greatest(0,(r->'record'->>'total_fee')::numeric-2500-5000)<>12500 THEN RAISE EXCEPTION 'Closing fee failed'; END IF;
 r:=update_deal_fees(d,'{"retainer_fee":100}','test',NULL,stamp,false);
 IF r->>'conflict'<>'true' OR r->'current'->>'retainer_fee'<>'2500' THEN RAISE EXCEPTION 'Fee concurrency failed'; END IF;
 r:=update_deal_fees(d,'{"success_fee_minimum":20000}','test',NULL,NULL,false);
 IF r->>'changed'<>'false' OR (SELECT count(*) FROM deal_audit_log)<>1 THEN RAISE EXCEPTION 'Identical fees should not write'; END IF;
 r:=update_deal_fees(d,'{"success_fee_minimum":null}','test','clear',NULL,false);
 IF r->'record'->>'success_fee_minimum' IS NOT NULL OR (r->'record'->>'total_fee')::numeric<>15000 OR r->'record'->>'retainer_fee'<>'2500' THEN RAISE EXCEPTION 'Null clear or partial update failed'; END IF;
 BEGIN PERFORM update_deal_fees(d,'{"total_fee":999}', 'test',NULL,NULL,false); RAISE EXCEPTION 'Derived fee accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='Derived fee accepted' THEN RAISE; END IF; END;
 INSERT INTO deal_qualifiers(id,deal_id,text,is_met,position) VALUES('44444444-4444-4444-8444-444444444444',d,' Existing verbatim ',true,0);
 original:=get_deal_qualifiers_record(d);
 IF original->'criteria'->0->>'text'<>' Existing verbatim ' OR original->>'executed_qualifies'<>'false' THEN RAISE EXCEPTION 'Legacy criteria not preserved'; END IF;
 a:='{"executed_qualifies":false,"match_rule":"any","criteria":[{"id":"44444444-4444-4444-8444-444444444444","position":0,"text":" Revised verbatim ","metric":"total_commitment","operator":">=","value":1500000,"unit":"$"}],"source_file_url":"https://example.com/agreement","agreement_signed_date":"2026-10-15"}';
 SELECT count(*) INTO cnt FROM deal_audit_log;
 r:=upsert_deal_qualifiers_record(d,a,'test','terms',NULL,true);
 IF r->'proposed'->'criteria'->0->>'is_met'<>'true' OR get_deal_qualifiers_record(d)<>original OR (SELECT count(*) FROM deal_audit_log)<>cnt THEN RAISE EXCEPTION 'Qualifier preview wrote or lost check'; END IF;
 r:=upsert_deal_qualifiers_record(d,a,'test','terms',(original->>'updated_at')::timestamptz,false);
 IF r->'record'->'criteria'->0->>'is_met'<>'true' OR r->'record'->'criteria'->0->>'text'<>' Revised verbatim ' OR r->'record'->>'match_rule'<>'any' THEN RAISE EXCEPTION 'Atomic agreement replacement failed'; END IF;
 SELECT count(*) INTO cnt FROM deal_audit_log;
 r:=upsert_deal_qualifiers_record(d,a,'test','retry',NULL,false);
 IF r->>'changed'<>'false' OR (SELECT count(*) FROM deal_audit_log)<>cnt THEN RAISE EXCEPTION 'Agreement retry not idempotent'; END IF;
 r:=upsert_deal_qualifiers_record(d,a,'test',NULL,(original->>'updated_at')::timestamptz,false);
 IF r->>'conflict'<>'true' THEN RAISE EXCEPTION 'Agreement concurrency failed'; END IF;
 a:=jsonb_set(a,'{criteria,0,is_met}','false');
 r:=upsert_deal_qualifiers_record(d,a,'test','uncheck',NULL,false);
 IF r->'record'->'criteria'->0->>'is_met'<>'false' THEN RAISE EXCEPTION 'Uncheck failed'; END IF;
 a:=jsonb_set(a,'{criteria}','[]');
 r:=upsert_deal_qualifiers_record(d,a,'test','remove',NULL,false);
 IF jsonb_array_length(r->'record'->'criteria')<>0 OR (SELECT count(*) FROM deal_qualifiers)<>0 THEN RAISE EXCEPTION 'Criteria removal failed'; END IF;
 BEGIN PERFORM upsert_deal_qualifiers_record(d,'{"executed_qualifies":false,"match_rule":"all","criteria":[{}]}','test',NULL,NULL,true); RAISE EXCEPTION 'Malformed criterion accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='Malformed criterion accepted' THEN RAISE; END IF; END;
 RAISE NOTICE 'Fee/qualifier previews, writes, null clears, legacy preservation, verbatim text, check/uncheck, removal, audit, concurrency and idempotency passed';
END $$;
SET request.user_id='55555555-5555-4555-8555-555555555555';
DO $$ BEGIN
 BEGIN PERFORM update_deal_fees('11111111-1111-4111-8111-111111111111','{"retainer_fee":999}','test',NULL,NULL,false); RAISE EXCEPTION 'Unauthorized fee write'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM get_deal_qualifiers_record('11111111-1111-4111-8111-111111111111'); RAISE EXCEPTION 'Unauthorized qualifier read'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM upsert_deal_qualifiers_record('11111111-1111-4111-8111-111111111111','{"executed_qualifies":true,"match_rule":"all","criteria":[]}','test',NULL,NULL,false); RAISE EXCEPTION 'Unauthorized qualifier write'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'Unauthorized read/write tests passed';
END $$;
SET request.user_id='';
DO $$ BEGIN
 BEGIN PERFORM update_deal_fees('11111111-1111-4111-8111-111111111111','{"retainer_fee":999}','test',NULL,NULL,false); RAISE EXCEPTION 'Unauthenticated fee write'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;