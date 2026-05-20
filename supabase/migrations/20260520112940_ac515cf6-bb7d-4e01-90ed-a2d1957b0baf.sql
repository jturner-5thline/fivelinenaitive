-- Allow company teammates to update/delete tasks attached to deals in their company.
-- Previously, only the assignee or the creator could update or delete a task, so
-- when a teammate (e.g. Niki) tried to mark complete, edit title, reassign, or
-- change due date on a task they didn't create or weren't assigned to, the
-- UPDATE matched 0 rows silently (RLS no-op) and the edit appeared to "not
-- persist". This widens write access to anyone in the same company as the
-- task's creator, matching the existing SELECT scope.

DROP POLICY IF EXISTS "Users can update tasks assigned to or by them" ON public.tasks;
CREATE POLICY "Users can update tasks in their company"
ON public.tasks
FOR UPDATE
USING (
  auth.uid() = assigned_to
  OR auth.uid() = assigned_by
  OR public.is_same_company_as_user(auth.uid(), assigned_by)
)
WITH CHECK (true);

DROP POLICY IF EXISTS "Users can delete tasks they created" ON public.tasks;
CREATE POLICY "Users can delete tasks in their company"
ON public.tasks
FOR DELETE
USING (
  auth.uid() = assigned_by
  OR public.is_same_company_as_user(auth.uid(), assigned_by)
);
