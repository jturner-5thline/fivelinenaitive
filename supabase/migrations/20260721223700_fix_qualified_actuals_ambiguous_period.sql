CREATE OR REPLACE FUNCTION public.get_funding_source_qualified_actuals(
  p_tenant_id uuid,
  p_year int,
  p_cadence text DEFAULT 'monthly'
)
RETURNS TABLE(period int, qualified_count int, lender_ids uuid[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH events AS (
    SELECT ml.id AS lender_id, ml.created_at AS event_at, 'created'::text AS event_kind
    FROM public.master_lenders ml
    WHERE ml.company_id = p_tenant_id
      AND EXTRACT(YEAR FROM ml.created_at) = p_year
    UNION ALL
    SELECT la.lender_id, la.created_at, 'contact_changed'::text
    FROM public.lender_audit_logs la
    JOIN public.master_lenders ml ON ml.id = la.lender_id
    WHERE ml.company_id = p_tenant_id
      AND la.field_changed IN ('Contact Name','Contact Email','contact_name','email','Email','Name','name')
      AND EXTRACT(YEAR FROM la.created_at) = p_year
  ),
  qualified AS (
    SELECT e.lender_id, e.event_at
    FROM events e
    WHERE EXISTS (
      SELECT 1
      FROM public.deal_lenders dl
      WHERE dl.master_lender_id = e.lender_id
        AND dl.submitted_at IS NOT NULL
        AND dl.submitted_at >= e.event_at
        AND dl.submitted_at <= e.event_at + interval '72 hours'
    )
  ),
  bucketed AS (
    SELECT q.lender_id,
      CASE
        WHEN lower(p_cadence) = 'quarterly'
          THEN (FLOOR((EXTRACT(MONTH FROM q.event_at)::int - 1)::numeric / 3) + 1)::int
        ELSE EXTRACT(MONTH FROM q.event_at)::int
      END AS period_idx,
      q.event_at
    FROM qualified q
  ),
  dedup AS (
    SELECT b.lender_id, b.period_idx, MIN(b.event_at) AS first_event_at
    FROM bucketed b
    GROUP BY b.lender_id, b.period_idx
  )
  SELECT d.period_idx AS period,
         COUNT(*)::int AS qualified_count,
         ARRAY_AGG(d.lender_id) AS lender_ids
  FROM dedup d
  GROUP BY d.period_idx
  ORDER BY d.period_idx;
END;
$$;
