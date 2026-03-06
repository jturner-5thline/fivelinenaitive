
CREATE TABLE public.subtask_checklist_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subtask_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.subtask_checklist_items ENABLE ROW LEVEL SECURITY;

-- RLS: users can manage checklist items for subtasks they have access to (same company)
CREATE POLICY "Users can view checklist items for their company tasks"
  ON public.subtask_checklist_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.company_members cm ON cm.company_id = t.company_id
      WHERE t.id = subtask_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert checklist items for their company tasks"
  ON public.subtask_checklist_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.company_members cm ON cm.company_id = t.company_id
      WHERE t.id = subtask_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update checklist items for their company tasks"
  ON public.subtask_checklist_items
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.company_members cm ON cm.company_id = t.company_id
      WHERE t.id = subtask_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete checklist items for their company tasks"
  ON public.subtask_checklist_items
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.company_members cm ON cm.company_id = t.company_id
      WHERE t.id = subtask_id AND cm.user_id = auth.uid()
    )
  );

CREATE INDEX idx_subtask_checklist_items_subtask_id ON public.subtask_checklist_items(subtask_id);
