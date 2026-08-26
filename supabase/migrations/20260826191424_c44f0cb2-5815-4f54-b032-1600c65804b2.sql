CREATE OR REPLACE FUNCTION public.get_new_qualified_lenders(p_tenant_id uuid, p_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(lender_id uuid, lender_name text, relationship_owners text, trigger_kind text, trigger_at timestamp with time zone, deal_id uuid, deal_company text, deal_added_at timestamp with time zone, delta_seconds bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id = p_tenant_id AND cm.user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH import_batches AS (
    SELECT dl.created_at AS ts
    FROM public.deal_lenders dl
    GROUP BY dl.created_at
    HAVING COUNT(DISTINCT dl.deal_id) >= 3
  ),
  events AS (
    SELECT ml.id AS lender_id, ml.created_at AS event_at, 'created'::text AS trigger_kind
    FROM public.master_lenders ml
    WHERE ml.company_id = p_tenant_id
    UNION ALL
    SELECT la.lender_id, la.created_at,
      CASE
        WHEN la.field_changed IN ('Contact Name','contact_name') THEN 'contact_name'
        WHEN la.field_changed IN ('Contact Email','contact_email','Email','email') THEN 'contact_email'
        WHEN la.field_changed IN ('Contact Phone','contact_phone','Phone','phone') THEN 'contact_phone'
        WHEN la.field_changed IN ('Contact Title','contact_title') THEN 'contact_title'
        WHEN la.field_changed IN ('Name','name') THEN 'name'
        ELSE la.field_changed
      END
    FROM public.lender_audit_logs la
    JOIN public.master_lenders ml ON ml.id = la.lender_id
    WHERE ml.company_id = p_tenant_id
      AND la.field_changed IN ('Contact Name','Contact Email','Contact Title','Contact Phone','contact_name','contact_email','contact_title','contact_phone','email','Email','Name','name','phone','Phone')
    UNION ALL
    SELECT lc.lender_id, lc.updated_at, 'primary_contact_updated'::text
    FROM public.lender_contacts lc
    JOIN public.master_lenders ml ON ml.id = lc.lender_id
    WHERE ml.company_id = p_tenant_id
      AND lc.is_primary IS TRUE
  ),
  scoped AS (
    SELECT * FROM events e
    WHERE (p_start IS NULL OR e.event_at >= p_start)
      AND (p_end IS NULL OR e.event_at < p_end)
  ),
  matched AS (
    SELECT s.lender_id, s.event_at, s.trigger_kind, dl.deal_id, dl.added_at
    FROM scoped s
    JOIN LATERAL (
      SELECT dl.deal_id, dl.created_at AS added_at
      FROM public.deal_lenders dl
      WHERE dl.master_lender_id = s.lender_id
        AND dl.created_at >= s.event_at
        AND dl.created_at <= s.event_at + interval '14 days'
        AND (p_start IS NULL OR dl.created_at >= p_start)
        AND (p_end IS NULL OR dl.created_at < p_end)
        AND dl.excluded_at IS NULL
        AND lower(coalesce(dl.tracking_status, '')) NOT IN ('excluded')
        AND lower(coalesce(dl.stage, '')) NOT IN ('excluded')
        AND NOT EXISTS (SELECT 1 FROM import_batches ib WHERE ib.ts = dl.created_at)
      ORDER BY dl.created_at ASC
      LIMIT 1
    ) dl ON TRUE
  ),
  dedup AS (
    SELECT DISTINCT ON (m.lender_id)
      m.lender_id, m.trigger_kind, m.event_at, m.deal_id, m.added_at
    FROM matched m
    ORDER BY m.lender_id, m.event_at ASC
  )
  SELECT d.lender_id,
         ml.name AS lender_name,
         ml.relationship_owners,
         d.trigger_kind,
         d.event_at AS trigger_at,
         d.deal_id,
         dd.company AS deal_company,
         d.added_at AS deal_added_at,
         EXTRACT(EPOCH FROM (d.added_at - d.event_at))::bigint AS delta_seconds
  FROM dedup d
  JOIN public.master_lenders ml ON ml.id = d.lender_id
  LEFT JOIN public.deals dd ON dd.id = d.deal_id
  ORDER BY d.event_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_funding_source_qualified_actuals(p_tenant_id uuid, p_year integer, p_cadence text DEFAULT 'monthly'::text)
 RETURNS TABLE(period integer, qualified_count integer, lender_ids uuid[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH import_batches AS (
    SELECT dl.created_at AS ts
    FROM public.deal_lenders dl
    GROUP BY dl.created_at
    HAVING COUNT(DISTINCT dl.deal_id) >= 3
  ),
  events AS (
    SELECT ml.id AS lender_id, ml.created_at AS event_at
    FROM public.master_lenders ml
    WHERE ml.company_id = p_tenant_id
      AND EXTRACT(YEAR FROM ml.created_at) = p_year
    UNION ALL
    SELECT la.lender_id, la.created_at
    FROM public.lender_audit_logs la
    JOIN public.master_lenders ml ON ml.id = la.lender_id
    WHERE ml.company_id = p_tenant_id
      AND la.field_changed IN ('Contact Name','Contact Email','Contact Title','Contact Phone','contact_name','contact_email','contact_title','contact_phone','email','Email','Name','name','phone','Phone')
      AND EXTRACT(YEAR FROM la.created_at) = p_year
    UNION ALL
    SELECT lc.lender_id, lc.updated_at
    FROM public.lender_contacts lc
    JOIN public.master_lenders ml ON ml.id = lc.lender_id
    WHERE ml.company_id = p_tenant_id
      AND lc.is_primary IS TRUE
      AND EXTRACT(YEAR FROM lc.updated_at) = p_year
  ),
  qualified AS (
    SELECT e.lender_id, e.event_at
    FROM events e
    WHERE EXISTS (
      SELECT 1
      FROM public.deal_lenders dl
      WHERE dl.master_lender_id = e.lender_id
        AND dl.created_at >= e.event_at
        AND dl.created_at <= e.event_at + interval '14 days'
        AND dl.excluded_at IS NULL
        AND lower(coalesce(dl.tracking_status, '')) NOT IN ('excluded')
        AND lower(coalesce(dl.stage, '')) NOT IN ('excluded')
        AND NOT EXISTS (SELECT 1 FROM import_batches ib WHERE ib.ts = dl.created_at)
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
$function$;

CREATE OR REPLACE FUNCTION public.get_funding_source_qualified_actuals_detail(p_tenant_id uuid, p_year integer, p_cadence text DEFAULT 'monthly'::text, p_period integer DEFAULT NULL::integer)
 RETURNS TABLE(period integer, lender_id uuid, lender_name text, relationship_owners text, trigger_kind text, trigger_at timestamp with time zone, deal_id uuid, deal_company text, deal_submitted_at timestamp with time zone, delta_seconds bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH import_batches AS (
    SELECT dl.created_at AS ts
    FROM public.deal_lenders dl
    GROUP BY dl.created_at
    HAVING COUNT(DISTINCT dl.deal_id) >= 3
  ),
  events AS (
    SELECT ml.id AS lender_id, ml.created_at AS event_at, 'created'::text AS trigger_kind
    FROM public.master_lenders ml
    WHERE ml.company_id = p_tenant_id
      AND EXTRACT(YEAR FROM ml.created_at) = p_year
    UNION ALL
    SELECT la.lender_id, la.created_at,
      CASE
        WHEN la.field_changed IN ('Contact Name','contact_name') THEN 'contact_name'
        WHEN la.field_changed IN ('Contact Email','contact_email','Email','email') THEN 'contact_email'
        WHEN la.field_changed IN ('Contact Phone','contact_phone','Phone','phone') THEN 'contact_phone'
        WHEN la.field_changed IN ('Contact Title','contact_title') THEN 'contact_title'
        WHEN la.field_changed IN ('Name','name') THEN 'name'
        ELSE la.field_changed
      END
    FROM public.lender_audit_logs la
    JOIN public.master_lenders ml ON ml.id = la.lender_id
    WHERE ml.company_id = p_tenant_id
      AND la.field_changed IN ('Contact Name','Contact Email','Contact Title','Contact Phone','contact_name','contact_email','contact_title','contact_phone','email','Email','Name','name','phone','Phone')
      AND EXTRACT(YEAR FROM la.created_at) = p_year
    UNION ALL
    SELECT lc.lender_id, lc.updated_at, 'primary_contact_updated'::text
    FROM public.lender_contacts lc
    JOIN public.master_lenders ml ON ml.id = lc.lender_id
    WHERE ml.company_id = p_tenant_id
      AND lc.is_primary IS TRUE
      AND EXTRACT(YEAR FROM lc.updated_at) = p_year
  ),
  matched AS (
    SELECT e.lender_id, e.event_at, e.trigger_kind,
           dl.deal_id, dl.added_at,
           CASE
             WHEN lower(p_cadence) = 'quarterly'
               THEN (FLOOR((EXTRACT(MONTH FROM e.event_at)::int - 1)::numeric / 3) + 1)::int
             ELSE EXTRACT(MONTH FROM e.event_at)::int
           END AS bucket_period
    FROM events e
    JOIN LATERAL (
      SELECT dl.deal_id, dl.created_at AS added_at
      FROM public.deal_lenders dl
      WHERE dl.master_lender_id = e.lender_id
        AND dl.created_at >= e.event_at
        AND dl.created_at <= e.event_at + interval '14 days'
        AND dl.excluded_at IS NULL
        AND lower(coalesce(dl.tracking_status, '')) NOT IN ('excluded')
        AND lower(coalesce(dl.stage, '')) NOT IN ('excluded')
        AND NOT EXISTS (SELECT 1 FROM import_batches ib WHERE ib.ts = dl.created_at)
      ORDER BY dl.created_at ASC
      LIMIT 1
    ) dl ON TRUE
  ),
  dedup AS (
    SELECT DISTINCT ON (m.lender_id, m.bucket_period)
      m.bucket_period AS period,
      m.lender_id,
      m.trigger_kind,
      m.event_at AS trigger_at,
      m.deal_id,
      m.added_at
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
         d.added_at AS deal_submitted_at,
         EXTRACT(EPOCH FROM (d.added_at - d.trigger_at))::bigint AS delta_seconds
  FROM dedup d
  JOIN public.master_lenders ml ON ml.id = d.lender_id
  LEFT JOIN public.deals dl_deal ON dl_deal.id = d.deal_id
  WHERE (p_period IS NULL OR d.period = p_period)
  ORDER BY d.period ASC, d.trigger_at DESC;
END;
$function$;