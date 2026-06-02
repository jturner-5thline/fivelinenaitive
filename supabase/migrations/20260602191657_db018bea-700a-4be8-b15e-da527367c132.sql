
-- 1. Log table for applied runs
CREATE TABLE IF NOT EXISTS public.performance_audit_applies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.performance_audit_runs(id) ON DELETE CASCADE,
  applied_by uuid,
  applied_at timestamptz NOT NULL DEFAULT now(),
  rows_affected int NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  reversed_at timestamptz,
  reversed_by uuid
);

GRANT SELECT ON public.performance_audit_applies TO authenticated;
GRANT ALL ON public.performance_audit_applies TO service_role;

ALTER TABLE public.performance_audit_applies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read audit applies"
  ON public.performance_audit_applies FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_perf_audit_applies_run ON public.performance_audit_applies(run_id);
CREATE INDEX IF NOT EXISTS idx_perf_audit_applies_applied_at ON public.performance_audit_applies(applied_at DESC);

-- 2. Apply RPC
CREATE OR REPLACE FUNCTION public.rep_audit_apply(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot jsonb;
  v_rep_user_id uuid;
  v_already_applied timestamptz;
  v_row jsonb;
  v_deal_id uuid;
  v_change text;
  v_confidence numeric;
  v_name text;
  v_lower text;
  v_before jsonb;
  v_changes jsonb := '[]'::jsonb;
  v_cnt_owner int := 0;
  v_cnt_lost int := 0;
  v_rows_affected int := 0;
  v_apply_id uuid;
  v_current_owner uuid;
  v_current_status text;
  v_current_lost_at timestamptz;
  v_current_lost_reason text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;

  SELECT snapshot, rep_user_id, applied_at
    INTO v_snapshot, v_rep_user_id, v_already_applied
  FROM public.performance_audit_runs
  WHERE id = p_run_id
  FOR UPDATE;

  IF v_snapshot IS NULL THEN
    RAISE EXCEPTION 'run not found: %', p_run_id;
  END IF;

  IF v_already_applied IS NOT NULL THEN
    RAISE EXCEPTION 'run already applied at %', v_already_applied;
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(v_snapshot->'rows')
  LOOP
    v_deal_id := (v_row->>'deal_id')::uuid;
    v_change := v_row->>'change_type';
    v_confidence := COALESCE((v_row->>'match_confidence')::numeric, 0);
    v_name := COALESCE(v_row->>'deal_name', '');
    v_lower := lower(v_name);

    -- Skip Lango entirely
    IF v_lower LIKE '%lango%' THEN
      CONTINUE;
    END IF;

    IF v_change = 'set_owner' AND v_confidence >= 0.95 THEN
      -- Capture before, update only if still unowned
      SELECT deal_owner_user_id INTO v_current_owner
      FROM public.deals WHERE id = v_deal_id FOR UPDATE;

      IF v_current_owner IS NULL THEN
        UPDATE public.deals
           SET deal_owner_user_id = v_rep_user_id,
               updated_at = now()
         WHERE id = v_deal_id;

        v_changes := v_changes || jsonb_build_object(
          'deal_id', v_deal_id,
          'deal_name', v_name,
          'change', 'set_owner',
          'before', jsonb_build_object('deal_owner_user_id', null),
          'after',  jsonb_build_object('deal_owner_user_id', v_rep_user_id)
        );
        v_cnt_owner := v_cnt_owner + 1;
        v_rows_affected := v_rows_affected + 1;
      END IF;

    ELSIF v_change = 'mark_lost' AND v_lower LIKE '%evgateway%' THEN
      SELECT status, lost_at, lost_reason
        INTO v_current_status, v_current_lost_at, v_current_lost_reason
      FROM public.deals WHERE id = v_deal_id FOR UPDATE;

      UPDATE public.deals
         SET status = 'lost',
             lost_at = COALESCE(lost_at, now()),
             lost_reason = COALESCE(lost_reason, 'duplicate - performance audit backfill'),
             updated_at = now()
       WHERE id = v_deal_id;

      v_changes := v_changes || jsonb_build_object(
        'deal_id', v_deal_id,
        'deal_name', v_name,
        'change', 'mark_lost',
        'before', jsonb_build_object(
          'status', v_current_status,
          'lost_at', v_current_lost_at,
          'lost_reason', v_current_lost_reason
        ),
        'after', jsonb_build_object(
          'status', 'lost',
          'lost_reason', COALESCE(v_current_lost_reason, 'duplicate - performance audit backfill')
        )
      );
      v_cnt_lost := v_cnt_lost + 1;
      v_rows_affected := v_rows_affected + 1;
    END IF;
    -- All other change_types (review, stamp_terms_issued, low-confidence BBP) skipped.
  END LOOP;

  -- Log
  INSERT INTO public.performance_audit_applies(
    run_id, applied_by, rows_affected, summary, changes
  ) VALUES (
    p_run_id,
    auth.uid(),
    v_rows_affected,
    jsonb_build_object(
      'rep_user_id', v_rep_user_id,
      'owners_attributed', v_cnt_owner,
      'marked_lost', v_cnt_lost
    ),
    v_changes
  ) RETURNING id INTO v_apply_id;

  UPDATE public.performance_audit_runs
     SET applied_at = now(), applied_by = auth.uid()
   WHERE id = p_run_id;

  RETURN jsonb_build_object(
    'apply_id', v_apply_id,
    'run_id', p_run_id,
    'rows_affected', v_rows_affected,
    'owners_attributed', v_cnt_owner,
    'marked_lost', v_cnt_lost,
    'applied_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rep_audit_apply(uuid) TO authenticated;

-- 3. Undo RPC
CREATE OR REPLACE FUNCTION public.rep_audit_undo(p_apply_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_apply_id uuid;
  v_run_id uuid;
  v_changes jsonb;
  v_row jsonb;
  v_deal_id uuid;
  v_change text;
  v_before jsonb;
  v_reverted int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;

  IF p_apply_id IS NULL THEN
    SELECT id INTO v_apply_id
    FROM public.performance_audit_applies
    WHERE reversed_at IS NULL
    ORDER BY applied_at DESC
    LIMIT 1;
  ELSE
    v_apply_id := p_apply_id;
  END IF;

  IF v_apply_id IS NULL THEN
    RAISE EXCEPTION 'no apply to undo';
  END IF;

  SELECT run_id, changes INTO v_run_id, v_changes
  FROM public.performance_audit_applies
  WHERE id = v_apply_id AND reversed_at IS NULL
  FOR UPDATE;

  IF v_changes IS NULL THEN
    RAISE EXCEPTION 'apply not found or already reversed';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(v_changes)
  LOOP
    v_deal_id := (v_row->>'deal_id')::uuid;
    v_change := v_row->>'change';
    v_before := v_row->'before';

    IF v_change = 'set_owner' THEN
      UPDATE public.deals
         SET deal_owner_user_id = NULLIF(v_before->>'deal_owner_user_id','')::uuid,
             updated_at = now()
       WHERE id = v_deal_id;
      v_reverted := v_reverted + 1;
    ELSIF v_change = 'mark_lost' THEN
      UPDATE public.deals
         SET status = NULLIF(v_before->>'status',''),
             lost_at = NULLIF(v_before->>'lost_at','')::timestamptz,
             lost_reason = NULLIF(v_before->>'lost_reason',''),
             updated_at = now()
       WHERE id = v_deal_id;
      v_reverted := v_reverted + 1;
    END IF;
  END LOOP;

  UPDATE public.performance_audit_applies
     SET reversed_at = now(), reversed_by = auth.uid()
   WHERE id = v_apply_id;

  UPDATE public.performance_audit_runs
     SET applied_at = NULL, applied_by = NULL
   WHERE id = v_run_id;

  RETURN jsonb_build_object(
    'apply_id', v_apply_id,
    'run_id', v_run_id,
    'rows_reverted', v_reverted,
    'reversed_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rep_audit_undo(uuid) TO authenticated;
