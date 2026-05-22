
-- ============================================================
-- Deals: Data-loss safeguards for 5 high-value text fields
-- ============================================================
-- Fields protected:
--   pain_points_confirmed, objections_raised, competitors_mentioned,
--   key_signal, product_gap_flagged
--
-- This migration installs THREE BEFORE/AFTER UPDATE triggers on public.deals:
--   1. prevent_protected_field_nullification — silently restores OLD value
--      when a client tries to write NULL/'' over a non-empty value, unless
--      the session GUC `app.allow_clear` is set to 'on' for an explicit
--      user-initiated clear action.
--   2. enforce_updated_at_occ — rejects updates whose NEW.updated_at is
--      older than OLD.updated_at (optimistic concurrency).
--   3. audit_protected_fields — writes one row per changed protected
--      column into public.deal_audit_log (action_type='field_change').
-- ============================================================

-- ---------- 1. Anti-nullification trigger ----------
CREATE OR REPLACE FUNCTION public.deals_prevent_protected_nullification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allow_clear text;
BEGIN
  -- Honor explicit clear actions (set via SET LOCAL app.allow_clear='on' in a tx).
  BEGIN
    allow_clear := current_setting('app.allow_clear', true);
  EXCEPTION WHEN OTHERS THEN
    allow_clear := NULL;
  END;

  IF allow_clear = 'on' THEN
    RETURN NEW;
  END IF;

  -- Restore OLD when a write would nullify/blank a previously-set value.
  IF OLD.pain_points_confirmed IS NOT NULL AND OLD.pain_points_confirmed <> ''
     AND (NEW.pain_points_confirmed IS NULL OR NEW.pain_points_confirmed = '') THEN
    NEW.pain_points_confirmed := OLD.pain_points_confirmed;
  END IF;
  IF OLD.objections_raised IS NOT NULL AND OLD.objections_raised <> ''
     AND (NEW.objections_raised IS NULL OR NEW.objections_raised = '') THEN
    NEW.objections_raised := OLD.objections_raised;
  END IF;
  IF OLD.competitors_mentioned IS NOT NULL AND OLD.competitors_mentioned <> ''
     AND (NEW.competitors_mentioned IS NULL OR NEW.competitors_mentioned = '') THEN
    NEW.competitors_mentioned := OLD.competitors_mentioned;
  END IF;
  IF OLD.key_signal IS NOT NULL AND OLD.key_signal <> ''
     AND (NEW.key_signal IS NULL OR NEW.key_signal = '') THEN
    NEW.key_signal := OLD.key_signal;
  END IF;
  IF OLD.product_gap_flagged IS NOT NULL AND OLD.product_gap_flagged <> ''
     AND (NEW.product_gap_flagged IS NULL OR NEW.product_gap_flagged = '') THEN
    NEW.product_gap_flagged := OLD.product_gap_flagged;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deals_prevent_protected_nullification ON public.deals;
CREATE TRIGGER trg_deals_prevent_protected_nullification
BEFORE UPDATE ON public.deals
FOR EACH ROW
EXECUTE FUNCTION public.deals_prevent_protected_nullification();

-- ---------- 2. Optimistic concurrency on updated_at ----------
CREATE OR REPLACE FUNCTION public.deals_enforce_updated_at_occ()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only enforce when the client explicitly sent an updated_at value
  -- AND it is strictly older than what's currently in the DB.
  IF NEW.updated_at IS NOT NULL
     AND OLD.updated_at IS NOT NULL
     AND NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'stale_update: deal % was modified by another session (client=% < db=%)',
      OLD.id, NEW.updated_at, OLD.updated_at
      USING ERRCODE = '40001';
  END IF;
  -- Always stamp the new updated_at to now() so subsequent OCC checks work.
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deals_enforce_updated_at_occ ON public.deals;
CREATE TRIGGER trg_deals_enforce_updated_at_occ
BEFORE UPDATE ON public.deals
FOR EACH ROW
EXECUTE FUNCTION public.deals_enforce_updated_at_occ();

-- ---------- 3. Audit trigger for the 5 protected fields ----------
CREATE OR REPLACE FUNCTION public.deals_audit_protected_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN
    -- Service-role / trigger context — still record using OLD.user_id as fallback.
    actor := OLD.user_id;
  END IF;

  IF COALESCE(OLD.pain_points_confirmed,'') IS DISTINCT FROM COALESCE(NEW.pain_points_confirmed,'') THEN
    INSERT INTO public.deal_audit_log (deal_id, user_id, action_type, entity_type, entity_name, metadata)
    VALUES (NEW.id, actor, 'field_change', 'deal', 'pain_points_confirmed',
            jsonb_build_object('field','pain_points_confirmed','old',OLD.pain_points_confirmed,'new',NEW.pain_points_confirmed));
  END IF;
  IF COALESCE(OLD.objections_raised,'') IS DISTINCT FROM COALESCE(NEW.objections_raised,'') THEN
    INSERT INTO public.deal_audit_log (deal_id, user_id, action_type, entity_type, entity_name, metadata)
    VALUES (NEW.id, actor, 'field_change', 'deal', 'objections_raised',
            jsonb_build_object('field','objections_raised','old',OLD.objections_raised,'new',NEW.objections_raised));
  END IF;
  IF COALESCE(OLD.competitors_mentioned,'') IS DISTINCT FROM COALESCE(NEW.competitors_mentioned,'') THEN
    INSERT INTO public.deal_audit_log (deal_id, user_id, action_type, entity_type, entity_name, metadata)
    VALUES (NEW.id, actor, 'field_change', 'deal', 'competitors_mentioned',
            jsonb_build_object('field','competitors_mentioned','old',OLD.competitors_mentioned,'new',NEW.competitors_mentioned));
  END IF;
  IF COALESCE(OLD.key_signal,'') IS DISTINCT FROM COALESCE(NEW.key_signal,'') THEN
    INSERT INTO public.deal_audit_log (deal_id, user_id, action_type, entity_type, entity_name, metadata)
    VALUES (NEW.id, actor, 'field_change', 'deal', 'key_signal',
            jsonb_build_object('field','key_signal','old',OLD.key_signal,'new',NEW.key_signal));
  END IF;
  IF COALESCE(OLD.product_gap_flagged,'') IS DISTINCT FROM COALESCE(NEW.product_gap_flagged,'') THEN
    INSERT INTO public.deal_audit_log (deal_id, user_id, action_type, entity_type, entity_name, metadata)
    VALUES (NEW.id, actor, 'field_change', 'deal', 'product_gap_flagged',
            jsonb_build_object('field','product_gap_flagged','old',OLD.product_gap_flagged,'new',NEW.product_gap_flagged));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deals_audit_protected_fields ON public.deals;
CREATE TRIGGER trg_deals_audit_protected_fields
AFTER UPDATE ON public.deals
FOR EACH ROW
EXECUTE FUNCTION public.deals_audit_protected_fields();
