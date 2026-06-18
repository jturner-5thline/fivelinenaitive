
-- 1. Dedupe existing duplicate funding sources on deals (keep oldest row).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY deal_id, COALESCE(master_lender_id::text, lower(trim(name)))
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM public.deal_lenders
  WHERE name IS NOT NULL
), dups AS (
  SELECT id FROM ranked WHERE rn > 1
)
DELETE FROM public.deal_lenders dl USING dups WHERE dl.id = dups.id;

-- 2. Prevent the same master_lender being attached to the same deal more than once.
CREATE UNIQUE INDEX IF NOT EXISTS deal_lenders_unique_deal_master
  ON public.deal_lenders (deal_id, master_lender_id)
  WHERE master_lender_id IS NOT NULL;

-- 3. Prevent the same source name being attached to the same deal more than once
--    (handles legacy rows without a master_lender_id).
CREATE UNIQUE INDEX IF NOT EXISTS deal_lenders_unique_deal_name
  ON public.deal_lenders (deal_id, lower(trim(name)))
  WHERE master_lender_id IS NULL AND name IS NOT NULL;
