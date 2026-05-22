ALTER TABLE public.deal_lenders
  ADD COLUMN IF NOT EXISTS excluded_at timestamptz,
  ADD COLUMN IF NOT EXISTS on_hold_at timestamptz,
  ADD COLUMN IF NOT EXISTS on_deck_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_deal_lenders_excluded_at
  ON public.deal_lenders (deal_id, excluded_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_deal_lenders_on_hold_at
  ON public.deal_lenders (deal_id, on_hold_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_deal_lenders_on_deck_at
  ON public.deal_lenders (deal_id, on_deck_at DESC NULLS LAST);

CREATE OR REPLACE FUNCTION public._deal_lender_status_bucket(
  _stage text,
  _substage text,
  _tracking text
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  ts text := lower(regexp_replace(coalesce(_tracking,''), '[_-]+', ' ', 'g'));
  st text := lower(regexp_replace(coalesce(_stage,''), '[_-]+', ' ', 'g'));
  sub text := lower(regexp_replace(coalesce(_substage,''), '[_-]+', ' ', 'g'));
BEGIN
  IF ts = 'excluded' OR st = 'excluded' THEN
    RETURN 'excluded';
  END IF;

  IF ts = 'on hold' OR st IN ('on hold','hold') THEN
    RETURN 'on_hold';
  END IF;

  IF ts = 'declined' OR st = 'declined' OR sub LIKE '%declined%' THEN
    RETURN 'declined';
  END IF;

  IF ts IN ('passed','pass') OR st IN ('passed','pass','no go','not a fit','unresponsive') THEN
    RETURN 'passed';
  END IF;

  IF st LIKE '%term%' OR st IN ('closed won','closed-won','approved') OR ts = 'approved' THEN
    RETURN 'approved';
  END IF;

  IF st IN ('on deck','sent drl','drl sent','data room sent') OR ts = 'on deck' THEN
    RETURN 'on_deck';
  END IF;

  IF ts IN ('active','in review') OR st LIKE '%review%' OR st LIKE '%management call%' THEN
    RETURN 'submitted';
  END IF;

  RETURN 'submitted';
END;
$$;

CREATE OR REPLACE FUNCTION public.deal_lenders_set_status_timestamps()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  new_bucket text;
  old_bucket text;
  allow_clear text;
BEGIN
  new_bucket := public._deal_lender_status_bucket(NEW.stage, NEW.substage, NEW.tracking_status);

  IF TG_OP = 'INSERT' THEN
    IF new_bucket IN ('submitted','approved','passed','declined') AND NEW.submitted_at IS NULL THEN
      NEW.submitted_at := now();
    END IF;
    IF new_bucket = 'approved' AND NEW.approved_at IS NULL THEN NEW.approved_at := now(); END IF;
    IF new_bucket = 'passed' AND NEW.passed_at IS NULL THEN NEW.passed_at := now(); END IF;
    IF new_bucket = 'declined' AND NEW.declined_at IS NULL THEN NEW.declined_at := now(); END IF;
    IF new_bucket = 'excluded' AND NEW.excluded_at IS NULL THEN NEW.excluded_at := now(); END IF;
    IF new_bucket = 'on_hold' AND NEW.on_hold_at IS NULL THEN NEW.on_hold_at := now(); END IF;
    IF new_bucket = 'on_deck' AND NEW.on_deck_at IS NULL THEN NEW.on_deck_at := now(); END IF;
    IF NEW.last_status_change_at IS NULL THEN NEW.last_status_change_at := now(); END IF;
    RETURN NEW;
  END IF;

  old_bucket := public._deal_lender_status_bucket(OLD.stage, OLD.substage, OLD.tracking_status);

  BEGIN
    allow_clear := current_setting('app.allow_clear', true);
  EXCEPTION WHEN OTHERS THEN
    allow_clear := NULL;
  END;

  IF coalesce(allow_clear,'') <> 'on' THEN
    IF NEW.submitted_at IS NULL AND OLD.submitted_at IS NOT NULL THEN NEW.submitted_at := OLD.submitted_at; END IF;
    IF NEW.passed_at IS NULL AND OLD.passed_at IS NOT NULL THEN NEW.passed_at := OLD.passed_at; END IF;
    IF NEW.declined_at IS NULL AND OLD.declined_at IS NOT NULL THEN NEW.declined_at := OLD.declined_at; END IF;
    IF NEW.approved_at IS NULL AND OLD.approved_at IS NOT NULL THEN NEW.approved_at := OLD.approved_at; END IF;
    IF NEW.excluded_at IS NULL AND OLD.excluded_at IS NOT NULL THEN NEW.excluded_at := OLD.excluded_at; END IF;
    IF NEW.on_hold_at IS NULL AND OLD.on_hold_at IS NOT NULL THEN NEW.on_hold_at := OLD.on_hold_at; END IF;
    IF NEW.on_deck_at IS NULL AND OLD.on_deck_at IS NOT NULL THEN NEW.on_deck_at := OLD.on_deck_at; END IF;
  END IF;

  IF NEW.submitted_at IS NULL AND new_bucket IN ('submitted','approved','passed','declined') THEN
    NEW.submitted_at := now();
  END IF;

  IF new_bucket IS DISTINCT FROM old_bucket THEN
    IF new_bucket = 'approved' AND NEW.approved_at IS NULL THEN NEW.approved_at := now(); END IF;
    IF new_bucket = 'passed' AND NEW.passed_at IS NULL THEN NEW.passed_at := now(); END IF;
    IF new_bucket = 'declined' AND NEW.declined_at IS NULL THEN NEW.declined_at := now(); END IF;
    IF new_bucket = 'excluded' AND NEW.excluded_at IS NULL THEN NEW.excluded_at := now(); END IF;
    IF new_bucket = 'on_hold' AND NEW.on_hold_at IS NULL THEN NEW.on_hold_at := now(); END IF;
    IF new_bucket = 'on_deck' AND NEW.on_deck_at IS NULL THEN NEW.on_deck_at := now(); END IF;
    NEW.last_status_change_at := now();
  END IF;

  RETURN NEW;
END;
$$;

UPDATE public.deal_lenders dl
SET
  excluded_at = COALESCE(
    excluded_at,
    CASE WHEN public._deal_lender_status_bucket(dl.stage, dl.substage, dl.tracking_status) = 'excluded'
      THEN COALESCE(dl.last_status_change_at, dl.updated_at, dl.created_at)
    END
  ),
  on_hold_at = COALESCE(
    on_hold_at,
    CASE WHEN public._deal_lender_status_bucket(dl.stage, dl.substage, dl.tracking_status) = 'on_hold'
      THEN COALESCE(dl.last_status_change_at, dl.updated_at, dl.created_at)
    END
  ),
  on_deck_at = COALESCE(
    on_deck_at,
    CASE WHEN public._deal_lender_status_bucket(dl.stage, dl.substage, dl.tracking_status) = 'on_deck'
      THEN COALESCE(dl.last_status_change_at, dl.updated_at, dl.created_at)
    END
  )
WHERE excluded_at IS NULL OR on_hold_at IS NULL OR on_deck_at IS NULL;