CREATE TRIGGER record_history AFTER UPDATE ON deals FOR EACH ROW EXECUTE FUNCTION record_deal_stage_change();
SET ROLE authenticated;
SET request.user_id='77777777-7777-4777-8777-777777777777';
DO $$ DECLARE result jsonb; BEGIN
 result:=mcp_update_deal_pipeline('66666666-6666-4666-8666-666666666666','33333333-3333-4333-8333-333333333333','{"stage":" benched ","value":20}');
 IF result->>'stage'<>'on-hold' OR result->>'stage_label'<>'Benched' OR result->>'pipeline_name'<>'In Development' OR result->>'narrative'<>'unchanged' OR (result->>'value')::numeric<>20 THEN RAISE EXCEPTION 'Target resolution/fields failed'; END IF;
 IF (SELECT count(*) FROM deal_activity)<>1 THEN RAISE EXCEPTION 'Activity missing'; END IF;
 IF NOT EXISTS(SELECT FROM deal_activity WHERE before->>'pipeline_name'='Active Deals' AND after->>'pipeline_name'='In Development') THEN RAISE EXCEPTION 'Pipeline from/to missing'; END IF;
 BEGIN
  PERFORM mcp_update_deal_pipeline('66666666-6666-4666-8666-666666666666','33333333-3333-4333-8333-333333333333','{"stage":"active-only"}');
  RAISE EXCEPTION 'Invalid stage accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='Invalid stage accepted' THEN RAISE; END IF; END;
 BEGIN
  PERFORM mcp_update_deal_pipeline('66666666-6666-4666-8666-666666666666','33333333-3333-4333-8333-333333333333','{}');
  RAISE EXCEPTION 'Missing stage accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='Missing stage accepted' THEN RAISE; END IF; END;
 BEGIN
  PERFORM mcp_update_deal_pipeline('66666666-6666-4666-8666-666666666666','44444444-4444-4444-8444-444444444444','{"stage":"on-hold"}');
  RAISE EXCEPTION 'Private pipeline accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM deal_stage_history)<>1 OR NOT EXISTS(SELECT FROM deal_stage_history WHERE from_stage_label_raw='Active hold' AND to_stage_label_raw='Benched' AND source='mcp_pipeline_change') THEN RAISE EXCEPTION 'Same-ID pipeline history failed'; END IF;
END $$;
-- Failure after the deal update must roll back both the deal and its history.
CREATE FUNCTION reject_activity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit failure'; END $$;
CREATE TRIGGER reject_activity BEFORE INSERT ON deal_activity FOR EACH ROW EXECUTE FUNCTION reject_activity();
SET ROLE authenticated;
DO $$ BEGIN
 BEGIN
  PERFORM mcp_update_deal_pipeline('66666666-6666-4666-8666-666666666666','22222222-2222-4222-8222-222222222222','{"stage":"active-only","value":999}');
  RAISE EXCEPTION 'Audit failure not raised';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'audit failure' THEN RAISE; END IF; END;
 IF NOT EXISTS(SELECT FROM deals WHERE stage='on-hold' AND pipeline_id='33333333-3333-4333-8333-333333333333' AND value=20) THEN RAISE EXCEPTION 'Atomic rollback failed'; END IF;
END $$;
SET request.user_id='88888888-8888-4888-8888-888888888888';
DO $$ BEGIN
 BEGIN
  PERFORM mcp_update_deal_pipeline('66666666-6666-4666-8666-666666666666','33333333-3333-4333-8333-333333333333','{"stage":"on-hold"}');
  RAISE EXCEPTION 'Unauthorized deal accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SET request.user_id='';
DO $$ BEGIN
 BEGIN
  PERFORM mcp_update_deal_pipeline('66666666-6666-4666-8666-666666666666','33333333-3333-4333-8333-333333333333','{"stage":"on-hold"}');
  RAISE EXCEPTION 'Unauthenticated accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN IF (SELECT count(*) FROM deal_stage_history)<>1 OR (SELECT count(*) FROM deal_activity)<>1 THEN RAISE EXCEPTION 'Rejected calls left audit records'; END IF; END $$;
SELECT 'Pipeline resolution, same-ID history, access denial and atomic rollback passed' AS result;

-- Preserve the production Distressed Debt trigger's restriction.
CREATE FUNCTION isolate_distressed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.pipeline_id IS DISTINCT FROM OLD.pipeline_id AND EXISTS(SELECT FROM deal_pipelines WHERE id IN (NEW.pipeline_id,OLD.pipeline_id) AND name='Distressed Debt') THEN
  RAISE EXCEPTION 'Deals cannot be moved into or out of the Distressed Debt pipeline';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER isolate_distressed BEFORE UPDATE ON deals FOR EACH ROW EXECUTE FUNCTION isolate_distressed();
INSERT INTO deal_pipelines VALUES('99999999-9999-4999-8999-999999999999','11111111-1111-4111-8111-111111111111','Distressed Debt','[{"id":"on-hold","label":"Hold"}]');
INSERT INTO deals(id,company_id,user_id,pipeline_id,stage,value) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','77777777-7777-4777-8777-777777777777','99999999-9999-4999-8999-999999999999','on-hold',1);
SET ROLE authenticated;
SET request.user_id='77777777-7777-4777-8777-777777777777';
DO $$ BEGIN
 BEGIN
  PERFORM mcp_update_deal_pipeline('66666666-6666-4666-8666-666666666666','99999999-9999-4999-8999-999999999999','{"stage":"on-hold"}');
  RAISE EXCEPTION 'Distressed entry accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Deals cannot be moved into or out of the Distressed Debt pipeline' THEN RAISE; END IF; END;
 BEGIN
  PERFORM mcp_update_deal_pipeline('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','{"stage":"on-hold"}');
  RAISE EXCEPTION 'Distressed exit accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Deals cannot be moved into or out of the Distressed Debt pipeline' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
SELECT 'Distressed Debt entry and exit rejected' AS result;