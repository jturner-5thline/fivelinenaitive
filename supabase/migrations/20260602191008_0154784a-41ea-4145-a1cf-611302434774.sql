
CREATE OR REPLACE FUNCTION public.rep_audit_dry_run(rep_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rep_email text;
  rep_name text;
  canonical text[] := ARRAY[
    'AMT','EverFI','Truelook','Aceup','Censys','Czerlonka','Anthros',
    'EVGateway','Phospholutions','Measurabl','Upflex','Opconnect'
  ];
  norm_allow text[] := ARRAY[
    'amt','everfi','truelook','aceup','censys','czerlonka','anthros',
    'evgateway','phospholutions','measurabl','upflex','opconnect'
  ];
  cutoff timestamptz := now() - INTERVAL '365 days';
  result jsonb;
  rows_json jsonb;
  bbp_json jsonb;
  summary jsonb;
  cnt_owner int := 0;
  cnt_lost int := 0;
  cnt_terms int := 0;
  cnt_requarter int := 0;
  cnt_review int := 0;
  run_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;

  SELECT email, COALESCE(raw_user_meta_data->>'full_name', email)
    INTO rep_email, rep_name
  FROM auth.users WHERE id = rep_user_id;

  WITH base AS (
    SELECT
      d.*,
      regexp_replace(lower(coalesce(d.company,'')), '[^a-z0-9]', '', 'g') AS norm_name,
      COUNT(*) OVER (PARTITION BY regexp_replace(lower(coalesce(d.company,'')), '[^a-z0-9]', '', 'g')) AS name_dupe_count
    FROM public.deals d
    WHERE lower(coalesce(d.company,'')) NOT LIKE 'test %'
      AND lower(coalesce(d.company,'')) NOT LIKE 'test-%'
      AND lower(coalesce(d.company,'')) NOT IN ('test-niki''s store','example deal')
  ),
  scored AS (
    SELECT b.*,
      (b.norm_name = ANY(norm_allow)
        OR EXISTS (SELECT 1 FROM unnest(norm_allow) AS a WHERE public.similarity(b.norm_name, a) >= 0.9)) AS in_allowlist,
      (lower(coalesce(b.deal_owner,'')) LIKE '%niki%' OR lower(coalesce(b.deal_owner,'')) LIKE '%heikali%') AS legacy_owner_hit
    FROM base b
  ),
  candidates AS (
    SELECT *
    FROM scored
    WHERE (in_allowlist OR legacy_owner_hit)
      AND deal_owner_user_id IS NULL
      AND (closed_at IS NULL OR closed_at >= cutoff)
      AND (lost_at IS NULL OR lost_at >= cutoff)
  ),
  enriched AS (
    SELECT c.id AS deal_id, c.company AS deal_name, c.deal_owner AS current_owner_text,
      c.deal_owner_user_id AS current_owner_uuid, c.manager AS current_manager,
      c.status AS current_status, c.stage AS current_stage,
      c.closed_at AS current_closed_at, c.lost_at AS current_lost_at,
      c.terms_issued_at AS current_terms_issued_at, c.terms_signed_at AS current_terms_signed_at,
      c.updated_at, c.in_allowlist, c.legacy_owner_hit, c.name_dupe_count,
      (SELECT MIN(entered_at) FROM public.deal_stage_durations dsd
        WHERE dsd.deal_id = c.id
          AND dsd.stage_slug IN ('terms-issued','final-credit-items','submitted-to-lenders')
      ) AS proposed_terms_issued_at,
      (SELECT MAX(entered_at) FROM public.deal_stage_durations dsd
        WHERE dsd.deal_id = c.id
          AND dsd.stage_slug IN ('closed-lost','lost','withdrawn')
      ) AS proposed_lost_at_from_history
    FROM candidates c
  ),
  classified AS (
    SELECT e.*,
      CASE WHEN in_allowlist THEN 1.0 WHEN legacy_owner_hit THEN 0.95 ELSE 0.6 END AS match_confidence,
      CASE WHEN regexp_replace(lower(deal_name),'[^a-z0-9]','','g') = 'evgateway' AND current_lost_at IS NULL
        THEN COALESCE(proposed_lost_at_from_history, updated_at) ELSE NULL END AS proposed_lost_at,
      CASE WHEN current_terms_issued_at IS NULL AND proposed_terms_issued_at IS NOT NULL
        THEN proposed_terms_issued_at ELSE NULL END AS proposed_terms_issued,
      (regexp_replace(lower(deal_name),'[^a-z0-9]','','g') = 'lango' AND current_closed_at IS NULL) AS lango_review_blocked
    FROM enriched e
  )
  SELECT jsonb_agg(jsonb_build_object(
    'deal_id', deal_id, 'deal_name', deal_name,
    'current_owner', current_owner_text, 'current_owner_user_id', current_owner_uuid,
    'proposed_owner', rep_name, 'proposed_owner_user_id', rep_user_id,
    'current_status', current_status,
    'proposed_status', CASE WHEN proposed_lost_at IS NOT NULL THEN 'lost' ELSE current_status END,
    'current_stage', current_stage,
    'current_closed_at', current_closed_at, 'current_lost_at', current_lost_at,
    'proposed_lost_at', proposed_lost_at,
    'current_terms_issued_at', current_terms_issued_at,
    'proposed_terms_issued_at', proposed_terms_issued,
    'current_terms_signed_at', current_terms_signed_at,
    'current_fiscal_bucket', CASE
      WHEN current_closed_at IS NOT NULL THEN public.deal_fiscal_bucket(current_closed_at)::text
      WHEN current_lost_at IS NOT NULL THEN public.deal_fiscal_bucket(current_lost_at)::text
      ELSE NULL END,
    'proposed_fiscal_bucket', CASE
      WHEN current_closed_at IS NOT NULL THEN public.deal_fiscal_bucket(current_closed_at)::text
      WHEN proposed_lost_at IS NOT NULL THEN public.deal_fiscal_bucket(proposed_lost_at)::text
      WHEN current_lost_at IS NOT NULL THEN public.deal_fiscal_bucket(current_lost_at)::text
      ELSE NULL END,
    'match_confidence', match_confidence,
    'change_type', CASE
      WHEN lango_review_blocked THEN 'review_blocked'
      WHEN proposed_lost_at IS NOT NULL THEN 'mark_lost'
      WHEN proposed_terms_issued IS NOT NULL THEN 'stamp_terms_issued'
      ELSE 'set_owner' END,
    'notes', CONCAT_WS(' | ',
      CASE WHEN in_allowlist THEN 'Allowlist hit (Asana 1214984842833276)' ELSE NULL END,
      CASE WHEN legacy_owner_hit THEN 'Legacy owner string contains Niki/Heikali' ELSE NULL END,
      'Owner unset → propose ' || rep_name,
      CASE WHEN proposed_lost_at IS NOT NULL THEN 'evGateway: mark lost' ELSE NULL END,
      CASE WHEN name_dupe_count > 1 AND regexp_replace(lower(deal_name),'[^a-z0-9]','','g') = 'evgateway'
        THEN 'possible duplicate — review (' || name_dupe_count || ' rows under this name)' ELSE NULL END,
      CASE WHEN proposed_terms_issued IS NOT NULL THEN 'Terms-issued anchor backfill from stage history' ELSE NULL END,
      CASE WHEN lango_review_blocked THEN 'Lango re-quartering review-blocked: missing signed_at (Phase 3 capture)' ELSE NULL END
    )
  )) INTO rows_json FROM classified;

  SELECT jsonb_agg(row_to_json(t)) INTO bbp_json FROM (
    SELECT d.id AS deal_id, d.company AS deal_name, d.deal_owner, d.manager, d.stage, d.status,
      ROUND(public.similarity(regexp_replace(lower(coalesce(d.company,'')),'[^a-z0-9]','','g'), 'bbp')::numeric, 3) AS score
    FROM public.deals d
    WHERE lower(coalesce(d.company,'')) NOT LIKE 'test %'
      AND lower(coalesce(d.company,'')) NOT LIKE 'test-%'
    ORDER BY public.similarity(regexp_replace(lower(coalesce(d.company,'')),'[^a-z0-9]','','g'), 'bbp') DESC NULLS LAST
    LIMIT 5
  ) t;

  SELECT
    COUNT(*) FILTER (WHERE r->>'change_type' IN ('set_owner','mark_lost','stamp_terms_issued')),
    COUNT(*) FILTER (WHERE r->>'change_type' = 'mark_lost'),
    COUNT(*) FILTER (WHERE r->>'change_type' = 'stamp_terms_issued'),
    COUNT(*) FILTER (WHERE r->>'current_fiscal_bucket' IS DISTINCT FROM r->>'proposed_fiscal_bucket'),
    COUNT(*) FILTER (WHERE r->>'change_type' = 'review_blocked')
  INTO cnt_owner, cnt_lost, cnt_terms, cnt_requarter, cnt_review
  FROM jsonb_array_elements(COALESCE(rows_json,'[]'::jsonb)) AS r;

  summary := jsonb_build_object(
    'rep_user_id', rep_user_id, 'rep_name', rep_name, 'rep_email', rep_email,
    'will_attribute', cnt_owner, 'will_mark_lost', cnt_lost,
    'will_stamp_terms_issued', cnt_terms, 'will_requarter', cnt_requarter,
    'review_rows', cnt_review,
    'total_rows', COALESCE(jsonb_array_length(rows_json), 0),
    'bbp_candidates_returned', COALESCE(jsonb_array_length(bbp_json), 0),
    'allowlist_canonical', to_jsonb(canonical), 'generated_at', now()
  );

  result := jsonb_build_object('summary', summary, 'rows', COALESCE(rows_json,'[]'::jsonb), 'bbp_candidates', COALESCE(bbp_json,'[]'::jsonb));

  INSERT INTO public.performance_audit_runs(rep_user_id, created_by, snapshot)
  VALUES (rep_user_id, auth.uid(), result)
  RETURNING id INTO run_id;

  result := jsonb_set(result, '{run_id}', to_jsonb(run_id));
  RETURN result;
END;
$$;
