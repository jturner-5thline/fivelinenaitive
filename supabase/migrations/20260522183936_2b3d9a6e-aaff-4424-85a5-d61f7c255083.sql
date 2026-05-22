-- 1. Schema additions
ALTER TABLE public.deal_lenders
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS passed_at timestamptz,
  ADD COLUMN IF NOT EXISTS declined_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_status_change_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_deal_lenders_submitted_at
  ON public.deal_lenders (deal_id, submitted_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_deal_lenders_last_status_change_at
  ON public.deal_lenders (deal_id, last_status_change_at DESC NULLS LAST);

-- 2. Status normalizer mirroring src/lib/lenderStatusBuckets.ts
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
  -- Excluded / on-hold → null (no status stamp)
  IF ts IN ('excluded','on hold') OR st IN ('excluded','on hold','hold') THEN
    RETURN NULL;
  END IF;
  -- Declined: explicit declined signal
  IF ts = 'declined' OR st = 'declined' OR sub LIKE '%declined%' THEN
    RETURN 'declined';
  END IF;
  -- Passed / no-go / not-a-fit / unresponsive
  IF ts IN ('passed','pass') OR st IN ('passed','pass','no go','not a fit','unresponsive') THEN
    RETURN 'passed';
  END IF;
  -- Terms issued / approved / closed-won
  IF st LIKE '%term%' OR st IN ('closed won','closed-won','approved') OR ts = 'approved' THEN
    RETURN 'approved';
  END IF;
  -- In review / active / reviewing
  IF ts IN ('active','in review') OR st LIKE '%review%' OR st LIKE '%management call%' THEN
    RETURN 'submitted';
  END IF;
  -- On deck (counts as submitted = lender has been engaged)
  IF st IN ('on deck','sent drl','drl sent','data room sent') OR ts = 'on deck' THEN
    RETURN 'submitted';
  END IF;
  RETURN 'submitted';
END;
$$;

-- 3. Trigger: stamp the matching column on status change
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
    IF new_bucket IN ('submitted','approved','passed','declined') THEN
      IF NEW.submitted_at IS NULL THEN NEW.submitted_at := now(); END IF;
      IF new_bucket = 'approved' AND NEW.approved_at IS NULL THEN NEW.approved_at := now(); END IF;
      IF new_bucket = 'passed' AND NEW.passed_at IS NULL THEN NEW.passed_at := now(); END IF;
      IF new_bucket = 'declined' AND NEW.declined_at IS NULL THEN NEW.declined_at := now(); END IF;
    END IF;
    IF NEW.last_status_change_at IS NULL THEN NEW.last_status_change_at := now(); END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  old_bucket := public._deal_lender_status_bucket(OLD.stage, OLD.substage, OLD.tracking_status);

  -- Guard against unintended clears unless app.allow_clear='on'
  BEGIN
    allow_clear := current_setting('app.allow_clear', true);
  EXCEPTION WHEN OTHERS THEN
    allow_clear := NULL;
  END;
  IF coalesce(allow_clear,'') <> 'on' THEN
    IF NEW.submitted_at IS NULL AND OLD.submitted_at IS NOT NULL THEN NEW.submitted_at := OLD.submitted_at; END IF;
    IF NEW.passed_at    IS NULL AND OLD.passed_at    IS NOT NULL THEN NEW.passed_at    := OLD.passed_at;    END IF;
    IF NEW.declined_at  IS NULL AND OLD.declined_at  IS NOT NULL THEN NEW.declined_at  := OLD.declined_at;  END IF;
    IF NEW.approved_at  IS NULL AND OLD.approved_at  IS NOT NULL THEN NEW.approved_at  := OLD.approved_at;  END IF;
  END IF;

  -- Always ensure submitted_at exists once the lender is in any active bucket
  IF NEW.submitted_at IS NULL AND new_bucket IN ('submitted','approved','passed','declined') THEN
    NEW.submitted_at := now();
  END IF;

  IF new_bucket IS DISTINCT FROM old_bucket THEN
    IF new_bucket = 'approved' AND NEW.approved_at IS NULL THEN NEW.approved_at := now(); END IF;
    IF new_bucket = 'passed'   AND NEW.passed_at   IS NULL THEN NEW.passed_at   := now(); END IF;
    IF new_bucket = 'declined' AND NEW.declined_at IS NULL THEN NEW.declined_at := now(); END IF;
    NEW.last_status_change_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deal_lenders_status_timestamps ON public.deal_lenders;
CREATE TRIGGER trg_deal_lenders_status_timestamps
BEFORE INSERT OR UPDATE ON public.deal_lenders
FOR EACH ROW
EXECUTE FUNCTION public.deal_lenders_set_status_timestamps();

-- 4. Backfill existing rows using current bucket + updated_at as best-available timestamp
UPDATE public.deal_lenders dl
SET
  submitted_at = COALESCE(submitted_at,
    CASE WHEN public._deal_lender_status_bucket(dl.stage, dl.substage, dl.tracking_status)
              IN ('submitted','approved','passed','declined')
         THEN COALESCE(dl.updated_at, dl.created_at) END),
  approved_at = COALESCE(approved_at,
    CASE WHEN public._deal_lender_status_bucket(dl.stage, dl.substage, dl.tracking_status) = 'approved'
         THEN COALESCE(dl.updated_at, dl.created_at) END),
  passed_at = COALESCE(passed_at,
    CASE WHEN public._deal_lender_status_bucket(dl.stage, dl.substage, dl.tracking_status) = 'passed'
         THEN COALESCE(dl.updated_at, dl.created_at) END),
  declined_at = COALESCE(declined_at,
    CASE WHEN public._deal_lender_status_bucket(dl.stage, dl.substage, dl.tracking_status) = 'declined'
         THEN COALESCE(dl.updated_at, dl.created_at) END),
  last_status_change_at = COALESCE(last_status_change_at, dl.updated_at, dl.created_at)
WHERE submitted_at IS NULL
   OR approved_at IS NULL
   OR passed_at IS NULL
   OR declined_at IS NULL
   OR last_status_change_at IS NULL;