DROP POLICY IF EXISTS "Members can be added by admins or via invitation" ON public.company_members;
CREATE POLICY "Members can be added by admins or company creator" ON public.company_members
FOR INSERT TO authenticated
WITH CHECK (
  public.is_company_admin(auth.uid(), company_id)
  OR ((user_id = auth.uid()) AND NOT EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = company_members.company_id))
);