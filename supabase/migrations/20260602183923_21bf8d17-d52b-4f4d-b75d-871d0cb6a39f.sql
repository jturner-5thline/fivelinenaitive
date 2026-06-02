-- Phase 1: Rep Scorecard schema + auto-stamp + backfill from stage history.

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS proposal_issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_issued_at    timestamptz,
  ADD COLUMN IF NOT EXISTS terms_signed_at    timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at          timestamptz,
  ADD COLUMN IF NOT EXISTS lost_at            timestamptz,
  ADD COLUMN IF NOT EXISTS deal_owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS deals_deal_owner_user_id_idx ON public.deals (deal_owner_user_id);
CREATE INDEX IF NOT EXISTS deals_closed_at_idx          ON public.deals (closed_at);
CREATE INDEX IF NOT EXISTS deals_lost_at_idx            ON public.deals (lost_at);
CREATE INDEX IF NOT EXISTS deals_terms_issued_at_idx    ON public.deals (terms_issued_at);
CREATE INDEX IF NOT EXISTS deals_proposal_issued_at_idx ON public.deals (proposal_issued_at);

CREATE OR REPLACE FUNCTION public.deals_stamp_stage_anchors()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    IF NEW.stage = 'proposal-issued' AND NEW.proposal_issued_at IS NULL THEN
      NEW.proposal_issued_at := now();
    END IF;
    IF NEW.stage = 'terms-issued' AND NEW.terms_issued_at IS NULL THEN
      NEW.terms_issued_at := now();
    END IF;
    IF NEW.stage IN ('funded-invoiced','closed-won') AND NEW.closed_at IS NULL THEN
      NEW.closed_at := now();
    END IF;
    IF NEW.stage = 'closed-lost' AND NEW.lost_at IS NULL THEN
      NEW.lost_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deals_stamp_stage_anchors_trg ON public.deals;
CREATE TRIGGER deals_stamp_stage_anchors_trg
  BEFORE UPDATE OF stage ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.deals_stamp_stage_anchors();

CREATE OR REPLACE FUNCTION public.deal_fiscal_bucket(ts timestamptz)
RETURNS TABLE (fiscal_year int, fiscal_quarter int)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    EXTRACT(YEAR FROM ts)::int    AS fiscal_year,
    EXTRACT(QUARTER FROM ts)::int AS fiscal_quarter
  WHERE ts IS NOT NULL;
$$;

WITH anchors AS (
  SELECT
    deal_id,
    MIN(entered_at) FILTER (WHERE stage_slug = 'terms-issued')                       AS terms_issued_at,
    MIN(entered_at) FILTER (WHERE stage_slug IN ('funded-invoiced','closed-won'))    AS closed_at,
    MIN(entered_at) FILTER (WHERE stage_slug = 'closed-lost')                        AS lost_at
  FROM public.deal_stage_durations
  GROUP BY deal_id
)
UPDATE public.deals d
SET
  terms_issued_at = COALESCE(d.terms_issued_at, a.terms_issued_at),
  closed_at       = COALESCE(d.closed_at,       a.closed_at),
  lost_at         = COALESCE(d.lost_at,         a.lost_at)
FROM anchors a
WHERE a.deal_id = d.id
  AND (
    (d.terms_issued_at IS NULL AND a.terms_issued_at IS NOT NULL) OR
    (d.closed_at       IS NULL AND a.closed_at       IS NOT NULL) OR
    (d.lost_at         IS NULL AND a.lost_at         IS NOT NULL)
  );

CREATE OR REPLACE VIEW public.v_deal_owner_resolution
WITH (security_invoker = true)
AS
SELECT
  d.id           AS deal_id,
  d.company      AS deal_name,
  d.company_id,
  d.stage,
  d.status,
  d.deal_owner_user_id AS current_owner_user_id,
  COALESCE(NULLIF(TRIM(d.deal_owner), ''), NULLIF(TRIM(d.manager), '')) AS raw_owner_text,
  p.user_id      AS candidate_user_id,
  p.display_name,
  p.full_name,
  p.email,
  CASE
    WHEN LOWER(TRIM(d.deal_owner)) = LOWER(TRIM(COALESCE(p.display_name, p.full_name, ''))) THEN 1.00
    WHEN LOWER(TRIM(d.manager))    = LOWER(TRIM(COALESCE(p.display_name, p.full_name, ''))) THEN 0.95
    WHEN LOWER(TRIM(COALESCE(p.display_name, p.full_name, ''))) <> ''
         AND POSITION(LOWER(TRIM(COALESCE(p.display_name, p.full_name, ''))) IN LOWER(COALESCE(d.deal_owner, d.manager, ''))) > 0 THEN 0.70
    ELSE 0.0
  END AS confidence
FROM public.deals d
CROSS JOIN public.profiles p
WHERE d.deal_owner_user_id IS NULL
  AND COALESCE(NULLIF(TRIM(d.deal_owner), ''), NULLIF(TRIM(d.manager), '')) IS NOT NULL
  AND (
    LOWER(TRIM(d.deal_owner)) = LOWER(TRIM(COALESCE(p.display_name, p.full_name, '')))
    OR LOWER(TRIM(d.manager))    = LOWER(TRIM(COALESCE(p.display_name, p.full_name, '')))
    OR (LOWER(TRIM(COALESCE(p.display_name, p.full_name, ''))) <> ''
        AND POSITION(LOWER(TRIM(COALESCE(p.display_name, p.full_name, ''))) IN LOWER(COALESCE(d.deal_owner, d.manager, ''))) > 0)
  );

GRANT SELECT ON public.v_deal_owner_resolution TO authenticated;
GRANT ALL    ON public.v_deal_owner_resolution TO service_role;