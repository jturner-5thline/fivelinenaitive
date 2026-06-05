-- Re-render Blount Capital historical activity backfill in the Activity tab.
-- The 2026-06-05 backfill inserted rows as activity_type='deal_updated', but the
-- Activity tab (useDealAuditLog) only surfaces activity_logs rows where
-- activity_type = 'claap_recording_linked'. Convert just those tagged rows so
-- they render in the per-deal Activity feed. Idempotent and scoped to the
-- backfill source tag — no other rows touched.

UPDATE public.activity_logs
SET activity_type = 'claap_recording_linked'
WHERE metadata->>'source' = 'blount_capital_historical_backfill_2026_06_05'
  AND activity_type <> 'claap_recording_linked';