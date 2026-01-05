-- Fix RLS policies so flag history works for deals without a company_id

ALTER TABLE public.deal_flag_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view flag notes for deals in their company" ON public.deal_flag_notes;
DROP POLICY IF EXISTS "Users can create flag notes for deals in their company" ON public.deal_flag_notes;
DROP POLICY IF EXISTS "Users can delete flag notes for deals in their company" ON public.deal_flag_notes;

-- View: allow deal owner OR any member of the deal's company (when company_id is set)
CREATE POLICY "Users can view flag notes for their deals"
ON public.deal_flag_notes
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.deals d
    WHERE d.id = deal_flag_notes.deal_id
      AND (
        d.user_id = auth.uid()
        OR (
          d.company_id IS NOT NULL
          AND d.company_id = public.get_user_company_id(auth.uid())
        )
      )
  )
);

-- Create: same access rule + enforce user_id matches the logged-in user
CREATE POLICY "Users can create flag notes for their deals"
ON public.deal_flag_notes
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.deals d
    WHERE d.id = deal_id
      AND (
        d.user_id = auth.uid()
        OR (
          d.company_id IS NOT NULL
          AND d.company_id = public.get_user_company_id(auth.uid())
        )
      )
  )
);

-- Delete: allow deal owner OR any member of the deal's company (when company_id is set)
CREATE POLICY "Users can delete flag notes for their deals"
ON public.deal_flag_notes
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.deals d
    WHERE d.id = deal_flag_notes.deal_id
      AND (
        d.user_id = auth.uid()
        OR (
          d.company_id IS NOT NULL
          AND d.company_id = public.get_user_company_id(auth.uid())
        )
      )
  )
);