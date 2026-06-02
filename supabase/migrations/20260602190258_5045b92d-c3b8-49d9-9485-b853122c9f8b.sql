
-- Audit runs table
CREATE TABLE IF NOT EXISTS public.performance_audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  snapshot jsonb NOT NULL,
  applied_at timestamptz,
  applied_by uuid
);

GRANT SELECT, INSERT, UPDATE ON public.performance_audit_runs TO authenticated;
GRANT ALL ON public.performance_audit_runs TO service_role;

ALTER TABLE public.performance_audit_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage audit runs" ON public.performance_audit_runs;
CREATE POLICY "admins manage audit runs"
  ON public.performance_audit_runs
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS perf_audit_runs_rep_idx
  ON public.performance_audit_runs(rep_user_id, created_at DESC);

-- Dry-run RPC: returns JSON + persists a snapshot. Read-only on deals.
CREATE OR REPLACE FUNCTION public.rep_audit_dry_run(rep_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rep_email text;
  rep_name text;
  rep_name_lower text;
  known_names text[] := ARRAY[
    'AMT','EverFi','TrueLook','AceUp','Censys Technologies','Czerlonka',
    'Anthros','evGateway','Phospholutions','Measurabl','Upflex','OpConnect','BBP','Lango'
  ];
  result jsonb;
  rows_json jsonb;
  summary jsonb;
  cnt_owner int := 0;
  cnt_lost int := 0;
  cnt_terms int := 0;
  cnt_requarter int := 0;
  run_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;

  SELECT email, COALESCE(raw_user_meta_data->>'full_name', email)
    INTO rep_email, rep_name
  FROM auth.users WHERE id = rep_user_id;
  rep_name_lower := lower(coalesce(rep_name, ''));

  WITH base AS (
    SELECT d.*
    FROM public.deals d
    WHERE
      -- exclude test deals (global rule)
      lower(coalesce(d.company,'')) NOT LIKE 'test %'
      AND lower(coalesce(d.company,'')) NOT LIKE 'test-%'
      AND lower(coalesce(d.company,'')) NOT IN ('test-niki''s store','example deal')
      AND (
        EXISTS (SELECT 1 FROM unnest(known_names) n WHERE lower(d.company) = lower(n))
        OR lower(coalesce(d.deal_owner,'')) LIKE '%niki%'
        OR lower(coalesce(d.deal_owner,'')) LIKE '%heikali%'
        OR lower(coalesce(d.manager,'')) LIKE '%niki%'
        OR lower(coalesce(d.manager,'')) LIKE '%heikali%'
      )
  ),
  enriched AS (
    SELECT
      b.id AS deal_id,
      b.company AS deal_name,
      b.deal_owner AS current_owner_text,
      b.deal_owner_user_id AS current_owner_uuid,
      b.manager AS current_manager,
      b.status AS current_status,
      b.stage AS current_stage,
      b.closed_at AS current_closed_at,
      b.lost_at AS current_lost_at,
      b.terms_issued_at AS current_terms_issued_at,
      b.terms_signed_at AS current_terms_signed_at,
      b.updated_at,
      -- proposed owner: niki where missing
      (b.deal_owner_user_id IS NULL) AS will_set_owner,
      -- proposed lost for evGateway
      (lower(b.company) = 'evgateway' AND b.status <> 'lost' AND b.lost_at IS NULL) AS will_mark_lost,
      -- earliest entry to terms-issued stage from history
      (SELECT MIN(entered_at) FROM public.deal_stage_durations dsd
        WHERE dsd.deal_id = b.id AND dsd.stage_slug IN ('terms-issued','final-credit-items','submitted-to-lenders')
      ) AS proposed_terms_issued_at,
      -- latest closed-lost entry
      (SELECT MAX(entered_at) FROM public.deal_stage_durations dsd
        WHERE dsd.deal_id = b.id AND dsd.stage_slug IN ('closed-lost','lost','withdrawn')
      ) AS proposed_lost_at_from_history
    FROM base b
  ),
  classified AS (
    SELECT
      e.*,
      -- match confidence
      CASE
        WHEN EXISTS (SELECT 1 FROM unnest(known_names) n WHERE lower(e.deal_name) = lower(n))
          THEN 1.0
        WHEN lower(coalesce(e.current_owner_text,'')) LIKE '%niki%'
          OR lower(coalesce(e.current_owner_text,'')) LIKE '%heikali%'
          THEN 0.95
        WHEN lower(coalesce(e.current_manager,'')) LIKE '%niki%'
          OR lower(coalesce(e.current_manager,'')) LIKE '%heikali%'
          THEN 0.9
        ELSE 0.6
      END AS match_confidence,
      -- proposed lost_at value
      CASE WHEN lower(e.deal_name) = 'evgateway' AND e.current_lost_at IS NULL
        THEN COALESCE(e.proposed_lost_at_from_history, e.updated_at)
        ELSE NULL
      END AS proposed_lost_at,
      -- proposed terms_issued for BBP only (or any niki deal currently missing anchor with history)
      CASE WHEN e.current_terms_issued_at IS NULL AND e.proposed_terms_issued_at IS NOT NULL
        THEN e.proposed_terms_issued_at
        ELSE NULL
      END AS proposed_terms_issued
    FROM enriched e
  )
  SELECT jsonb_agg(jsonb_build_object(
    'deal_id', deal_id,
    'deal_name', deal_name,
    'current_owner', current_owner_text,
    'current_owner_user_id', current_owner_uuid,
    'proposed_owner', CASE WHEN will_set_owner THEN rep_name ELSE current_owner_text END,
    'proposed_owner_user_id', CASE WHEN will_set_owner THEN rep_user_id ELSE current_owner_uuid END,
    'current_status', current_status,
    'proposed_status', CASE WHEN will_mark_lost THEN 'lost' ELSE current_status END,
    'current_stage', current_stage,
    'current_closed_at', current_closed_at,
    'current_lost_at', current_lost_at,
    'proposed_lost_at', proposed_lost_at,
    'current_terms_issued_at', current_terms_issued_at,
    'proposed_terms_issued_at', proposed_terms_issued,
    'current_terms_signed_at', current_terms_signed_at,
    'current_fiscal_bucket', CASE
      WHEN current_closed_at IS NOT NULL THEN public.deal_fiscal_bucket(current_closed_at)
      WHEN current_lost_at IS NOT NULL THEN public.deal_fiscal_bucket(current_lost_at)
      ELSE NULL
    END,
    'proposed_fiscal_bucket', CASE
      WHEN current_closed_at IS NOT NULL THEN public.deal_fiscal_bucket(current_closed_at)
      WHEN proposed_lost_at IS NOT NULL THEN public.deal_fiscal_bucket(proposed_lost_at)
      WHEN current_lost_at IS NOT NULL THEN public.deal_fiscal_bucket(current_lost_at)
      ELSE NULL
    END,
    'match_confidence', match_confidence,
    'change_type', CASE
      WHEN will_mark_lost THEN 'mark_lost'
      WHEN proposed_terms_issued IS NOT NULL THEN 'stamp_terms_issued'
      WHEN will_set_owner THEN 'set_owner'
      ELSE 'review'
    END,
    'notes', CONCAT_WS(' | ',
      CASE WHEN will_set_owner THEN 'Owner unset → propose ' || rep_name ELSE NULL END,
      CASE WHEN will_mark_lost THEN 'evGateway: mark lost (no current lost_at)' ELSE NULL END,
      CASE WHEN proposed_terms_issued IS NOT NULL THEN 'Terms-issued anchor backfill from stage history' ELSE NULL END,
      CASE WHEN lower(deal_name) IN ('lango','opconnect') AND current_closed_at IS NOT NULL THEN
        'Re-quartering check: closed_at → ' || public.deal_fiscal_bucket(current_closed_at)::text
        ELSE NULL END
    )
  )) INTO rows_json
  FROM classified;

  -- counts
  SELECT
    COUNT(*) FILTER (WHERE (r->>'proposed_owner_user_id')::uuid = rep_user_id
                       AND (r->>'current_owner_user_id') IS NULL),
    COUNT(*) FILTER (WHERE r->>'change_type' = 'mark_lost'),
    COUNT(*) FILTER (WHERE r->>'change_type' = 'stamp_terms_issued'),
    COUNT(*) FILTER (WHERE r->>'current_fiscal_bucket' IS DISTINCT FROM r->>'proposed_fiscal_bucket')
  INTO cnt_owner, cnt_lost, cnt_terms, cnt_requarter
  FROM jsonb_array_elements(COALESCE(rows_json,'[]'::jsonb)) AS r;

  summary := jsonb_build_object(
    'rep_user_id', rep_user_id,
    'rep_name', rep_name,
    'rep_email', rep_email,
    'will_attribute', cnt_owner,
    'will_mark_lost', cnt_lost,
    'will_stamp_terms_issued', cnt_terms,
    'will_requarter', cnt_requarter,
    'total_rows', COALESCE(jsonb_array_length(rows_json), 0),
    'generated_at', now()
  );

  result := jsonb_build_object('summary', summary, 'rows', COALESCE(rows_json,'[]'::jsonb));

  INSERT INTO public.performance_audit_runs(rep_user_id, created_by, snapshot)
  VALUES (rep_user_id, auth.uid(), result)
  RETURNING id INTO run_id;

  result := jsonb_set(result, '{run_id}', to_jsonb(run_id));
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.rep_audit_dry_run(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.rep_audit_dry_run(uuid) TO authenticated;
