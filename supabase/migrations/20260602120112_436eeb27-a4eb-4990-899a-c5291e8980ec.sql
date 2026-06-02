DROP POLICY IF EXISTS "Users can create deals" ON public.deals;

CREATE POLICY "Users can create deals"
ON public.deals
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    company_id IS NULL
    OR public.is_company_member(auth.uid(), company_id)
  )
);