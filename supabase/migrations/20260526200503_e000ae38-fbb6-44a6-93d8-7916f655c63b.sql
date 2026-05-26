DROP POLICY IF EXISTS "Users can view collaborators for their company tasks" ON public.task_collaborators;
DROP POLICY IF EXISTS "Users can add collaborators for their company tasks" ON public.task_collaborators;
DROP POLICY IF EXISTS "Users can remove collaborators for their company tasks" ON public.task_collaborators;

CREATE OR REPLACE FUNCTION public.can_access_task(_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tasks t
    LEFT JOIN public.deals d ON d.id = t.deal_id
    WHERE t.id = _task_id
      AND (
        t.assigned_to = auth.uid()
        OR t.assigned_by = auth.uid()
        OR t.created_by = auth.uid()
        OR (t.company_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.company_members cm
          WHERE cm.company_id = t.company_id AND cm.user_id = auth.uid()
        ))
        OR (d.company_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.company_members cm
          WHERE cm.company_id = d.company_id AND cm.user_id = auth.uid()
        ))
      )
  );
$$;

CREATE POLICY "Users can view collaborators on accessible tasks"
ON public.task_collaborators FOR SELECT TO authenticated
USING (public.can_access_task(task_id));

CREATE POLICY "Users can add collaborators on accessible tasks"
ON public.task_collaborators FOR INSERT TO authenticated
WITH CHECK (public.can_access_task(task_id));

CREATE POLICY "Users can remove collaborators on accessible tasks"
ON public.task_collaborators FOR DELETE TO authenticated
USING (public.can_access_task(task_id));