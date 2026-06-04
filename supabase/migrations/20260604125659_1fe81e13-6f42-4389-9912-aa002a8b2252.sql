
-- Shared agenda per (company_id, period_type, period_key).
-- Keep user_id as "last editor" but drop per-user uniqueness.

-- 1) Backfill: collapse duplicate (company, period) rows, keeping the most
--    recently updated content, and delete the older siblings.
WITH ranked AS (
  SELECT id, company_id, period_type, period_key,
         row_number() OVER (
           PARTITION BY company_id, period_type, period_key
           ORDER BY updated_at DESC, created_at DESC, id
         ) AS rn
  FROM public.insights_agenda
)
DELETE FROM public.insights_agenda a
USING ranked r
WHERE a.id = r.id AND r.rn > 1;

-- 2) Replace per-user unique constraint with shared (company, period) unique.
ALTER TABLE public.insights_agenda
  DROP CONSTRAINT IF EXISTS insights_agenda_period_unique;

ALTER TABLE public.insights_agenda
  ADD CONSTRAINT insights_agenda_shared_period_unique
  UNIQUE (company_id, period_type, period_key);

-- 3) Allow user_id to be nullable and rename semantics to "last editor".
--    (Existing rows keep their last-editor user_id.)
ALTER TABLE public.insights_agenda
  ALTER COLUMN user_id DROP NOT NULL;

-- 4) Rewrite RLS: any company member can read/write the shared row.
DROP POLICY IF EXISTS "Users can view their own agenda in their company" ON public.insights_agenda;
DROP POLICY IF EXISTS "Users can insert their own agenda in their company" ON public.insights_agenda;
DROP POLICY IF EXISTS "Users can update their own agenda in their company" ON public.insights_agenda;
DROP POLICY IF EXISTS "Users can delete their own agenda in their company" ON public.insights_agenda;

CREATE POLICY "Company members can view shared agenda"
  ON public.insights_agenda FOR SELECT
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can insert shared agenda"
  ON public.insights_agenda FOR INSERT
  WITH CHECK (
    public.is_company_member(auth.uid(), company_id)
    AND (user_id IS NULL OR user_id = auth.uid())
  );

CREATE POLICY "Company members can update shared agenda"
  ON public.insights_agenda FOR UPDATE
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (
    public.is_company_member(auth.uid(), company_id)
    AND (user_id IS NULL OR user_id = auth.uid())
  );

CREATE POLICY "Company members can delete shared agenda"
  ON public.insights_agenda FOR DELETE
  USING (public.is_company_member(auth.uid(), company_id));
