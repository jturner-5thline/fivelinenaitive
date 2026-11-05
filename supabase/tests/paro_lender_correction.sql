-- Read-only post-correction regression checks; never invokes the maintenance function.
WITH expected(name,day) AS (VALUES
 ('Eastward Capital Partners','2026-10-27'::date),
 ('LAGO Global Capital Management','2026-10-21'::date),
 ('TIMIA Capital','2026-10-26'::date),
 ('Change Capital','2026-10-22'::date),
 ('Decathlon Capital','2026-10-28'::date),
 ('Clearline Financial','2026-10-13'::date),
 ('VFI Corporate Finance','2026-10-14'::date),
 ('Wayflier','2026-10-12'::date),
 ('Revtek','2026-09-30'::date),
 ('Advantage Capital','2026-09-30'::date),
 ('Equal Capital','2026-09-30'::date)
), actual AS (
 SELECT dl.* FROM public.deal_lenders dl
 WHERE deal_id='b624a054-74ae-4a71-a74d-e59062e85863'
)
SELECT e.name AS rule,
 coalesce(a.stage='passed' AND a.tracking_status='passed'
 AND a.passed_at=(e.day+time '12:00') AT TIME ZONE 'America/Chicago'
 AND a.last_status_change_at=a.passed_at
 AND EXISTS(SELECT 1 FROM public.activity_logs l WHERE l.deal_id=a.deal_id
 AND l.metadata->>'lender_id'=a.id::text
 AND l.metadata->>'correction_key'='paro-20261105'
 AND l.created_at=a.passed_at),false) AS passed
FROM expected e LEFT JOIN actual a ON a.name=e.name
UNION ALL
SELECT 'Excluded lenders unchanged',count(*)=4 AND bool_and(md5(to_jsonb(a)::text)=e.hash)
FROM actual a JOIN (VALUES
 ('Creditfy','59be9f31dd90b14053c2f14edfa6bdc8'),
 ('Milestone Bank','2bb3f08f7c8fec8c2f8885f865cf36b0'),
 ('Montage Capital','a0ae0dafaea23eda482d1a74017b0673'),
 ('North Axis Partners','1d24b442ccee0f4dd95520a93cbd8722')
) e(name,hash) ON e.name=a.name
UNION ALL
SELECT 'No browser or service access',NOT has_function_privilege('anon','public.apply_approved_paro_lender_correction_20261105(jsonb)','EXECUTE')
 AND NOT has_function_privilege('authenticated','public.apply_approved_paro_lender_correction_20261105(jsonb)','EXECUTE')
 AND NOT has_function_privilege('service_role','public.apply_approved_paro_lender_correction_20261105(jsonb)','EXECUTE');