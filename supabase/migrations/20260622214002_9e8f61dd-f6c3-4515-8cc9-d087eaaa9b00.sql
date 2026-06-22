
CREATE OR REPLACE FUNCTION public.merge_master_lenders(_keep_id uuid, _merge_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _keep_name text;
  _all_ids uuid[];
BEGIN
  IF _keep_id IS NULL OR _merge_ids IS NULL OR array_length(_merge_ids, 1) IS NULL THEN
    RETURN;
  END IF;
  _all_ids := _keep_id || _merge_ids;

  SELECT name INTO _keep_name FROM public.master_lenders WHERE id = _keep_id;
  IF _keep_name IS NULL THEN
    RAISE EXCEPTION 'Kept funding source % not found', _keep_id;
  END IF;

  -- ============================================================
  -- 1) deal_lenders: merge per-deal rows so we don't lose history.
  --    For each deal that has rows for multiple lenders in the
  --    cluster, pick a "winner" (most-advanced status, then most
  --    recently updated), coalesce notes/pass-reasons and the
  --    earliest/latest status timestamps from the losers into it,
  --    then delete the losers. Finally point all surviving rows
  --    at the kept lender and refresh their displayed name.
  -- ============================================================
  WITH ranked AS (
    SELECT id, deal_id,
      ROW_NUMBER() OVER (
        PARTITION BY deal_id
        ORDER BY
          CASE tracking_status
            WHEN 'active'   THEN 0
            WHEN 'on-deck'  THEN 1
            WHEN 'on-hold'  THEN 2
            WHEN 'passed'   THEN 3
            WHEN 'excluded' THEN 4
            ELSE 5
          END,
          updated_at DESC NULLS LAST,
          created_at DESC NULLS LAST
      ) AS rn
    FROM public.deal_lenders
    WHERE master_lender_id = ANY(_all_ids)
  ),
  winners AS (SELECT id, deal_id FROM ranked WHERE rn = 1),
  agg AS (
    SELECT w.id AS winner_id,
      string_agg(NULLIF(btrim(d.notes), ''), E'\n---\n') AS extra_notes,
      string_agg(NULLIF(btrim(d.pass_reason), ''), '; ') AS extra_pass_reasons,
      MIN(d.submitted_at)            AS min_submitted,
      MIN(d.passed_at)               AS min_passed,
      MIN(d.declined_at)             AS min_declined,
      MIN(d.approved_at)             AS min_approved,
      MIN(d.on_deck_at)              AS min_on_deck,
      MIN(d.on_hold_at)              AS min_on_hold,
      MIN(d.excluded_at)             AS min_excluded,
      MAX(d.last_contact_at)         AS max_last_contact,
      MAX(d.last_status_change_at)   AS max_last_status
    FROM winners w
    JOIN public.deal_lenders d
      ON d.deal_id = w.deal_id
     AND d.id <> w.id
     AND d.master_lender_id = ANY(_all_ids)
    GROUP BY w.id
  )
  UPDATE public.deal_lenders dl SET
    notes = NULLIF(
              concat_ws(E'\n---\n', NULLIF(btrim(dl.notes), ''), a.extra_notes),
              ''
            ),
    pass_reason = COALESCE(NULLIF(btrim(dl.pass_reason), ''), a.extra_pass_reasons),
    submitted_at          = LEAST(dl.submitted_at,         a.min_submitted),
    passed_at             = LEAST(dl.passed_at,            a.min_passed),
    declined_at           = LEAST(dl.declined_at,          a.min_declined),
    approved_at           = LEAST(dl.approved_at,          a.min_approved),
    on_deck_at            = LEAST(dl.on_deck_at,           a.min_on_deck),
    on_hold_at            = LEAST(dl.on_hold_at,           a.min_on_hold),
    excluded_at           = LEAST(dl.excluded_at,          a.min_excluded),
    last_contact_at       = GREATEST(dl.last_contact_at,       a.max_last_contact),
    last_status_change_at = GREATEST(dl.last_status_change_at, a.max_last_status),
    updated_at = now()
  FROM agg a
  WHERE dl.id = a.winner_id;

  DELETE FROM public.deal_lenders
   WHERE id IN (
     SELECT id FROM (
       SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY deal_id
           ORDER BY
             CASE tracking_status
               WHEN 'active'   THEN 0
               WHEN 'on-deck'  THEN 1
               WHEN 'on-hold'  THEN 2
               WHEN 'passed'   THEN 3
               WHEN 'excluded' THEN 4
               ELSE 5
             END,
             updated_at DESC NULLS LAST,
             created_at DESC NULLS LAST
         ) AS rn
       FROM public.deal_lenders
       WHERE master_lender_id = ANY(_all_ids)
     ) r
     WHERE r.rn > 1
   );

  UPDATE public.deal_lenders
     SET master_lender_id = _keep_id,
         name = _keep_name
   WHERE master_lender_id = ANY(_merge_ids);

  -- ============================================================
  -- 2) lender_contacts: reassign to kept lender.
  -- ============================================================
  UPDATE public.lender_contacts
     SET lender_id = _keep_id
   WHERE lender_id = ANY(_merge_ids);

  -- ============================================================
  -- 3) lender_notes: reassign (the FK is SET NULL on cascade so
  --    without this the notes would otherwise become orphaned).
  -- ============================================================
  UPDATE public.lender_notes
     SET master_lender_id = _keep_id
   WHERE master_lender_id = ANY(_merge_ids);

  -- ============================================================
  -- 4) lender_audit_logs: reassign so audit history follows.
  -- ============================================================
  UPDATE public.lender_audit_logs
     SET lender_id = _keep_id
   WHERE lender_id = ANY(_merge_ids);

  -- ============================================================
  -- 5) lender_fit_attributes: unique on master_lender_id, so we
  --    promote the most-recent merged row only if the kept lender
  --    doesn't already have one, then drop the rest.
  -- ============================================================
  IF NOT EXISTS (
    SELECT 1 FROM public.lender_fit_attributes WHERE master_lender_id = _keep_id
  ) THEN
    UPDATE public.lender_fit_attributes
       SET master_lender_id = _keep_id
     WHERE id = (
       SELECT id FROM public.lender_fit_attributes
        WHERE master_lender_id = ANY(_merge_ids)
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
        LIMIT 1
     );
  END IF;
  DELETE FROM public.lender_fit_attributes
   WHERE master_lender_id = ANY(_merge_ids);

  -- ============================================================
  -- 6) lender_pass_patterns: unique (master_lender_id, reason,
  --    type, value) — reassign only when no clash, drop the rest.
  -- ============================================================
  UPDATE public.lender_pass_patterns p
     SET master_lender_id = _keep_id
   WHERE master_lender_id = ANY(_merge_ids)
     AND NOT EXISTS (
       SELECT 1 FROM public.lender_pass_patterns q
        WHERE q.master_lender_id = _keep_id
          AND q.reason_category  = p.reason_category
          AND q.pattern_type     = p.pattern_type
          AND q.pattern_value    = p.pattern_value
     );
  DELETE FROM public.lender_pass_patterns
   WHERE master_lender_id = ANY(_merge_ids);

  -- ============================================================
  -- 7) lender_disqualifications & sync_requests: reassign.
  -- ============================================================
  UPDATE public.lender_disqualifications
     SET master_lender_id = _keep_id
   WHERE master_lender_id = ANY(_merge_ids);

  UPDATE public.lender_sync_requests
     SET existing_lender_id = _keep_id
   WHERE existing_lender_id = ANY(_merge_ids);

  -- ============================================================
  -- 8) Finally remove the merged master records.
  -- ============================================================
  DELETE FROM public.master_lenders WHERE id = ANY(_merge_ids);
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_master_lenders(uuid, uuid[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.merge_master_lenders(uuid, uuid[]) FROM anon;
