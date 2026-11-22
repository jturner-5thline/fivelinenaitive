-- Run after master-plan-fixture.sql and migration 0102, in the isolated test DB only.
SET ROLE authenticated;
SELECT set_config('request.user_id','11111111-1111-4111-8111-111111111111',false),set_config('request.email','jturner@5thline.co',false);
DO $$ DECLARE r jsonb; BEGIN
 r:=mcp_write_master_plan('targets','[{"metric_key":"plan:financials:finserv:revenue","metric_label":"Revenue","period":"2027-01","value":125000}]');
 IF (r->>'would_update')::int<>1 OR EXISTS(SELECT 1 FROM insights_metric_targets) OR EXISTS(SELECT 1 FROM master_plan_mcp_audit) THEN RAISE EXCEPTION 'Dry run changed data'; END IF;
 r:=mcp_write_master_plan('targets','[{"metric_key":"plan:financials:finserv:revenue","metric_label":"Revenue","period":"2027-01","value":125000},{"metric_key":"plan:financials:finserv:revenue","metric_label":"Revenue","period":"2027-Q1","value":450000}]',false,true,'approved test');
 IF (r->>'updated')::int<>2 OR (SELECT count(*) FROM master_plan_mcp_audit)<>2 THEN RAISE EXCEPTION 'Save/audit failed'; END IF;
 IF (SELECT target_value FROM insights_metric_targets WHERE period_month='2027-01')<>125000 OR (SELECT target_value FROM insights_metric_targets WHERE period_month='2027-Q1')<>450000 THEN RAISE EXCEPTION 'Period separation failed'; END IF;
 r:=mcp_write_master_plan('targets','[{"metric_key":"plan:financials:finserv:revenue","metric_label":"Revenue","period":"2027-01","value":125000}]',false,true);
 IF (r->>'unchanged')::int<>1 OR (SELECT count(*) FROM master_plan_mcp_audit)<>2 THEN RAISE EXCEPTION 'No-op retry audited twice'; END IF;
 r:=mcp_write_master_plan('targets','[{"metric_key":"plan:financials:finserv:revenue","metric_label":"Revenue","period":"2027-01","value":null}]',false,true);
 IF EXISTS(SELECT 1 FROM insights_metric_targets WHERE period_month='2027-01') OR (SELECT before_value FROM master_plan_mcp_audit WHERE after_value IS NULL)<>125000 THEN RAISE EXCEPTION 'Clear/audit failed'; END IF;
 BEGIN
  PERFORM mcp_write_master_plan('targets','[{"metric_key":"plan:financials:finserv:revenue","metric_label":"Revenue","period":"2027-02","value":1},{"metric_key":"plan:financials:finserv:revenue","metric_label":"Revenue","period":"2027-13","value":2}]',false,true);
  RAISE EXCEPTION 'Invalid period accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='Invalid period accepted' THEN RAISE; END IF; END;
 IF EXISTS(SELECT 1 FROM insights_metric_targets WHERE period_month='2027-02') OR (SELECT count(*) FROM master_plan_mcp_audit)<>3 THEN RAISE EXCEPTION 'Batch was not atomic'; END IF;
 BEGIN
  PERFORM mcp_write_master_plan('targets','[{"metric_key":"plan:financials:finserv:revenue","metric_label":"Revenue","period":"2027-02","value":1}]',false,false);
  RAISE EXCEPTION 'Unapproved write accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='Unapproved write accepted' THEN RAISE; END IF; END;
 r:=mcp_write_master_plan('headcount','[{"realm_id":"193514877331929","month":"2027-01","value":3.25}]',false,true);
 IF (SELECT headcount FROM monthly_entity_headcount)<>3.25 THEN RAISE EXCEPTION 'Headcount save failed'; END IF;
 r:=mcp_write_master_plan('headcount','[{"realm_id":"193514877331929","month":"2027-01","value":null}]',false,true);
 IF (SELECT headcount FROM monthly_entity_headcount) IS NOT NULL THEN RAISE EXCEPTION 'Headcount clear failed'; END IF;
 BEGIN
  PERFORM mcp_write_master_plan('headcount','[{"realm_id":"193514877331929","month":"2027-Q1","value":3}]',false,true);
  RAISE EXCEPTION 'Quarterly headcount write accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='Quarterly headcount write accepted' THEN RAISE; END IF; END;
 BEGIN
  PERFORM mcp_write_master_plan('headcount','[{"realm_id":"193514877331929","month":"2027-02","value":10000}]',false,true);
  RAISE EXCEPTION 'Invalid FTE accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='Invalid FTE accepted' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.user_id','22222222-2222-4222-8222-222222222222',false),set_config('request.email','member@5thline.co',false);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM master_plan_mcp_audit) THEN RAISE EXCEPTION 'Other user audit exposed'; END IF;
 BEGIN PERFORM mcp_write_master_plan('headcount','[{"realm_id":"193514877331929","month":"2027-01","value":3}]',false,true); RAISE EXCEPTION 'Non-editor accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.user_id','33333333-3333-4333-8333-333333333333',false),set_config('request.email','jturner@5thline.co',false);
DO $$ BEGIN
 BEGIN PERFORM mcp_write_master_plan('headcount','[{"realm_id":"193514877331929","month":"2027-01","value":3}]',false,true); RAISE EXCEPTION 'Non-member accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'Master Plan isolated save, clear, audit, atomicity, preview and permissions passed' AS result;