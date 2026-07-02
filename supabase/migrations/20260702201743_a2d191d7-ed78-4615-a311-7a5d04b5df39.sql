-- Backfill intercompany_adjustment for FinServ (5th Line Financial Services) cash flow snapshots
-- from the parsed QBO Statement of Cash Flows (Accrual). Values are the sum of
-- all "Due to/from 5th Line Capital LLC" rows for each month.
UPDATE public.qbo_cashflow_snapshots
SET intercompany_adjustment = v.adj, updated_at = now()
FROM (VALUES
  (DATE '2026-01-01', -1079.22),
  (DATE '2026-02-01',  -595.48),
  (DATE '2026-03-01', -1788.26),
  (DATE '2026-04-01', -34771.51),
  (DATE '2026-05-01', -15297.96),
  (DATE '2026-06-01', -19100.00)
) AS v(bucket_start, adj)
WHERE qbo_cashflow_snapshots.realm_id = '9341451968897660'
  AND qbo_cashflow_snapshots.bucket_start = v.bucket_start;