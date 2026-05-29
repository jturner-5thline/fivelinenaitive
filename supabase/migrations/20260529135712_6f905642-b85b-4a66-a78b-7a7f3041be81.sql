
CREATE OR REPLACE FUNCTION public.get_funding_source_qualified_actuals_detail(
  p_tenant_id uuid,
  p_year int,
  p_cadence text DEFAULT 'monthly',
  p_period int DEFAULT NULL
)
RETURNS TABLE(
  period int,
  lender_id uuid,
  lender_name text,
  relationship_owners text,
  trigger_kind text,
  trigger_at timestamptz,
  deal_id uuid,
  deal_company text,
  deal_submitted_at timestamptz,
  delta_seconds bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH events AS (
    SELECT ml.id AS lender_id, ml.created_at AS event_at, 'created'::text AS trigger_kind
    FROM public.master_lenders ml
    WHERE ml.company_id = p_tenant_id
      AND EXTRACT(YEAR FROM ml.created_at) = p_year
    UNION ALL
    SELECT la.lender_id, la.created_at,
      CASE
        WHEN la.field_changed IN ('Contact Name','contact_name') THEN 'contact_name'
        WHEN la.field_changed IN ('Contact Email','contact_email','Email','email') THEN 'contact_email'
        WHEN la.field_changed IN ('Name','name') THEN 'name'
        ELSE la.field_changed
      END
    FROM public.lender_audit_logs la
    JOIN public.master_lenders ml ON ml.id = la.lender_id
    WHERE ml.company_id = p_tenant_id
      AND la.field_changed IN ('Contact Name','Contact Email','contact_name','contact_email','email','Email','Name','name')
      AND EXTRACT(YEAR FROM la.created_at) = p_year
  ),
  matched AS (
    SELECT e.lender_id, e.event_at, e.trigger_kind,
           dl.deal_id, dl.submitted_at,
           CASE
             WHEN lower(p_cadence) = 'quarterly'
               THEN (FLOOR((EXTRACT(MONTH FROM e.event_at)::int - 1)::numeric / 3) + 1)::int
             ELSE EXTRACT(MONTH FROM e.event_at)::int
           END AS bucket_period
    FROM events e
    JOIN LATERAL (
      SELECT dl.deal_id, dl.submitted_at
      FROM public.deal_lenders dl
      WHERE dl.master_lender_id = e.lender_id
        AND dl.submitted_at IS NOT NULL
        AND dl.submitted_at >= e.event_at
        AND dl.submitted_at <= e.event_at + interval '72 hours'
      ORDER BY dl.submitted_at ASC
      LIMIT 1
    ) dl ON TRUE
  ),
  -- Dedupe: one row per (lender, period) — take earliest qualifying trigger.
  dedup AS (
    SELECT DISTINCT ON (m.lender_id, m.bucket_period)
      m.bucket_period AS period,
      m.lender_id,
      m.trigger_kind,
      m.event_at AS trigger_at,
      m.deal_id,
      m.submitted_at AS deal_submitted_at
    FROM matched m
    ORDER BY m.lender_id, m.bucket_period, m.event_at ASC
  )
  SELECT d.period,
         d.lender_id,
         ml.name AS lender_name,
         ml.relationship_owners,
         d.trigger_kind,
         d.trigger_at,
         d.deal_id,
         dl_deal.company AS deal_company,
         d.deal_submitted_at,
         EXTRACT(EPOCH FROM (d.deal_submitted_at - d.trigger_at))::bigint AS delta_seconds
  FROM dedup d
  JOIN public.master_lenders ml ON ml.id = d.lender_id
  LEFT JOIN public.deals dl_deal ON dl_deal.id = d.deal_id
  WHERE (p_period IS NULL OR d.period = p_period)
  ORDER BY d.period ASC, d.trigger_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_funding_source_qualified_actuals_detail(uuid, int, text, int) TO authenticated, service_role;
