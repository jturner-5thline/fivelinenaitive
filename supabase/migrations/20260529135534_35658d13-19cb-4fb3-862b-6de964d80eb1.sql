
-- Trigger to capture contact_name/email changes on master_lenders into lender_audit_logs.
CREATE OR REPLACE FUNCTION public.log_master_lender_contact_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.contact_name IS DISTINCT FROM OLD.contact_name THEN
    INSERT INTO public.lender_audit_logs(lender_id, user_id, action, field_changed, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'updated', 'Contact Name', OLD.contact_name, NEW.contact_name);
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    INSERT INTO public.lender_audit_logs(lender_id, user_id, action, field_changed, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'updated', 'Contact Email', OLD.email, NEW.email);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_master_lender_contact_changes ON public.master_lenders;
CREATE TRIGGER trg_log_master_lender_contact_changes
AFTER UPDATE ON public.master_lenders
FOR EACH ROW EXECUTE FUNCTION public.log_master_lender_contact_changes();

-- RPC: per-period qualified funding source actuals for the Performance card.
-- "Qualified" = lender had a trigger event (created OR contact name/email changed)
-- followed by a submitted deal (deal_lenders.submitted_at) within 72 hours.
-- Deduped to count each lender at most once per reporting period (monthly/quarterly).
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
      END AS period,
      q.event_at
    FROM qualified q
  ),
  dedup AS (
    -- Count each lender at most once per reporting period (earliest qualifying event).
    SELECT lender_id, period, MIN(event_at) AS first_event_at
    FROM bucketed
    GROUP BY lender_id, period
  )
  SELECT d.period,
         COUNT(*)::int AS qualified_count,
         ARRAY_AGG(d.lender_id) AS lender_ids
  FROM dedup d
  GROUP BY d.period
  ORDER BY d.period;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_funding_source_qualified_actuals(uuid, int, text) TO authenticated, service_role;
