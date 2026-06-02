-- UPDATE: keep existing visibility check, add WITH CHECK to block cross-tenant reassignment
DROP POLICY IF EXISTS "Users can update deals" ON public.deals;

CREATE POLICY "Users can update deals"
ON public.deals
FOR UPDATE
TO authenticated
USING (
  CASE
    WHEN (SELECT public.get_user_company_id(auth.uid())) IS NOT NULL
      THEN (
        company_id = (SELECT public.get_user_company_id(auth.uid()))
        OR (SELECT public.is_same_company_as_user(auth.uid(), deals.user_id))
      )
    ELSE auth.uid() = user_id
  END
)
WITH CHECK (
  company_id IS NULL
  OR public.is_company_member(auth.uid(), company_id)
);

-- DELETE: platform admin, workspace admin of the deal's company, or owner of an unassigned deal
DROP POLICY IF EXISTS "Only admins can delete deals" ON public.deals;

CREATE POLICY "Members can delete deals in their workspace"
ON public.deals
FOR DELETE
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR (
    company_id IS NOT NULL
    AND public.is_company_admin(auth.uid(), company_id)
  )
  OR (
    company_id IS NULL
    AND auth.uid() = user_id
  )
);