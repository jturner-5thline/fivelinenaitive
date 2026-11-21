-- Run only against the isolated agreement test database with its authenticated/RLS fixtures.
\set ON_ERROR_STOP on
BEGIN;
ALTER TABLE public.deal_activity ALTER COLUMN before SET NOT NULL;
INSERT INTO public.deals(id,company_id,user_id) VALUES('99999999-9999-4999-8999-999999999999','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333');
SET LOCAL ROLE authenticated;
SET LOCAL request.user_id='33333333-3333-4333-8333-333333333333';
DO $$
DECLARE d uuid:='99999999-9999-4999-8999-999999999999'; r jsonb; result jsonb; before_count integer; rejected boolean;
BEGIN
 r:='{"executed_qualifies":false,"match_rule":"any","min_required":3,"criteria":[{"position":0,"text":"a"},{"position":1,"text":"b"},{"position":2,"text":"c"},{"position":3,"text":"d"}]}'::jsonb;
 SELECT count(*) INTO before_count FROM public.deal_activity WHERE deal_id=d;
 result:=public.upsert_deal_qualifiers_record(d,r);
 IF result->>'changed'<>'true' OR EXISTS(SELECT 1 FROM public.deal_qualifiers WHERE deal_id=d) THEN RAISE EXCEPTION 'Dry run wrote data'; END IF;
 result:=public.upsert_deal_qualifiers_record(d,r,p_dry_run=>false);
 IF result#>>'{record,min_required}'<>'3' OR NOT EXISTS(SELECT 1 FROM public.deal_activity WHERE deal_id=d AND before='{}'::jsonb) THEN RAISE EXCEPTION 'First-save threshold or empty-before regression'; END IF;
 SET CONSTRAINTS ALL IMMEDIATE;
 result:=public.upsert_deal_qualifiers_record(d,r,p_dry_run=>false);
 IF result->>'changed'<>'false' OR (SELECT count(*) FROM public.deal_activity WHERE deal_id=d)<>before_count+1 THEN RAISE EXCEPTION 'Retry wrote duplicate audit'; END IF;
 rejected:=false;
 BEGIN PERFORM public.upsert_deal_qualifiers_record(d,jsonb_set(r,'{min_required}','5')); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Excessive minimum accepted'; END IF;
 rejected:=false;
 BEGIN PERFORM public.upsert_deal_qualifiers_record(d,jsonb_set(r,'{min_required}','1.5')); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Fractional minimum accepted'; END IF;
 -- Whole replacements validate only the final transaction state.
 SET CONSTRAINTS ALL DEFERRED;
 r:='{"executed_qualifies":false,"match_rule":"all","groups_logic":"each_group_separately","groups":[{"key":"term_loan_refi","label":"Term Loan (Refi)","match_rule":"all","fee":10000},{"key":"capex","label":"CapEx","match_rule":"any","min_required":1,"fee":5000}],"criteria":[{"position":0,"text":"Refi","group":"term_loan_refi"},{"position":1,"text":"New CapEx","group":"capex"}]}'::jsonb;
 result:=public.upsert_deal_qualifiers_record(d,r,p_dry_run=>false);
 SET CONSTRAINTS ALL IMMEDIATE;
 IF result#>>'{record,groups_logic}'<>'each_group_separately' OR result#>>'{record,criteria,0,group}'<>'term_loan_refi' THEN RAISE EXCEPTION 'Groups did not persist/read back'; END IF;
 result:=public.upsert_deal_qualifiers_record(d,r,p_dry_run=>false);
 IF result->>'changed'<>'false' THEN RAISE EXCEPTION 'Group retry was not idempotent'; END IF;
 rejected:=false;
 BEGIN DELETE FROM public.deal_qualifiers WHERE deal_id=d AND "group"='capex'; EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Legacy delete left an impossible group minimum'; END IF;
 rejected:=false;
 BEGIN PERFORM public.upsert_deal_qualifiers_record(d,jsonb_set(r,'{criteria,0,group}','"unknown"')); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Unknown group accepted'; END IF;
END $$;
SET LOCAL request.user_id='44444444-4444-4444-8444-444444444444';
DO $$ BEGIN
 BEGIN
  PERFORM public.upsert_deal_qualifiers_record('99999999-9999-4999-8999-999999999999','{"executed_qualifies":false,"match_rule":"all","criteria":[]}'::jsonb,p_dry_run=>false);
  RAISE EXCEPTION 'Unauthorized write accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
ROLLBACK;
