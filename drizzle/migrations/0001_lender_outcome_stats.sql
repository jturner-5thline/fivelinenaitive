-- Phase 2: outcome feedback loop for lender matching.
-- Aggregates historical deal_lenders outcomes per master lender so the match
-- engine can weight lenders by real track record.
CREATE OR REPLACE VIEW public.lender_outcome_stats AS
WITH normalized AS (
  SELECT
    dl.master_lender_id,
    dl.deal_id,
    lower(coalesce(dl.stage, '')) AS stage,
    dl.submitted_at,
    dl.approved_at,
    dl.passed_at,
    dl.declined_at,
    dl.last_status_change_at,
    dl.quote_amount,
    dl.created_at
  FROM public.deal_lenders dl
  WHERE dl.master_lender_id IS NOT NULL
)
SELECT
  master_lender_id,
  count(DISTINCT deal_id)::int AS engagements,
  count(*) FILTER (
    WHERE stage LIKE '%term%' OR stage = 'approved' OR stage LIKE '%funded%' OR approved_at IS NOT NULL
  )::int AS terms_count,
  count(*) FILTER (WHERE stage LIKE '%funded%')::int AS funded_count,
  count(*) FILTER (
    WHERE stage LIKE '%pass%' OR stage LIKE '%not-a-fit%' OR stage = 'unresponsive'
      OR passed_at IS NOT NULL OR declined_at IS NOT NULL
  )::int AS passed_count,
  max(coalesce(last_status_change_at, submitted_at, created_at)) AS last_activity_at
FROM normalized
GROUP BY master_lender_id;

GRANT SELECT ON public.lender_outcome_stats TO authenticated;
GRANT SELECT ON public.lender_outcome_stats TO service_role;
