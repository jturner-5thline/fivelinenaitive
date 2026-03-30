DROP POLICY IF EXISTS "Users can update tasks assigned to or by them" ON public.tasks;

CREATE POLICY "Users can update tasks assigned to or by them"
ON public.tasks
FOR UPDATE
TO authenticated
USING ((auth.uid() = assigned_to) OR (auth.uid() = assigned_by))
WITH CHECK (true);