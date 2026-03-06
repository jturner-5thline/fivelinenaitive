
CREATE TABLE public.task_collaborators (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (task_id, user_id)
);

ALTER TABLE public.task_collaborators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view collaborators for their company tasks"
  ON public.task_collaborators
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.company_members cm ON cm.company_id = t.company_id
      WHERE t.id = task_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can add collaborators for their company tasks"
  ON public.task_collaborators
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.company_members cm ON cm.company_id = t.company_id
      WHERE t.id = task_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can remove collaborators for their company tasks"
  ON public.task_collaborators
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.company_members cm ON cm.company_id = t.company_id
      WHERE t.id = task_id AND cm.user_id = auth.uid()
    )
  );

CREATE INDEX idx_task_collaborators_task_id ON public.task_collaborators(task_id);
CREATE INDEX idx_task_collaborators_user_id ON public.task_collaborators(user_id);
