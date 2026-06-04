DROP POLICY IF EXISTS "Users can create tasks" ON public.tasks;
DROP POLICY IF EXISTS "Company members can create tasks" ON public.tasks;
CREATE POLICY "Company members can create tasks" ON public.tasks
FOR INSERT TO authenticated
WITH CHECK (
  company_id IS NULL
  OR EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_members.user_id = auth.uid()
      AND company_members.company_id = tasks.company_id
  )
);