DROP POLICY IF EXISTS "View comments" ON public.task_comments;

CREATE POLICY "View comments"
ON public.task_comments
FOR SELECT
TO authenticated
USING (
  author_id = auth.uid()
  OR task_id IN (
    SELECT t.id
    FROM public.tasks t
    WHERE t.assigned_to = auth.uid()
       OR t.assigned_by = auth.uid()
       OR public.is_same_company_as_user(auth.uid(), t.assigned_by)
  )
);