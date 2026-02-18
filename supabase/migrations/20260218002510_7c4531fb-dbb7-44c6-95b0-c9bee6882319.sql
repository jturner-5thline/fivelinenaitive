
-- Create a simple tasks table
CREATE TABLE public.tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID REFERENCES public.deals(id) ON DELETE CASCADE,
  assigned_to UUID NOT NULL,
  assigned_by UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Users can see tasks they created or are assigned to, within same company
CREATE POLICY "Users can view tasks in their company"
ON public.tasks FOR SELECT
USING (
  public.is_same_company_as_user(auth.uid(), assigned_by)
);

CREATE POLICY "Users can create tasks"
ON public.tasks FOR INSERT
WITH CHECK (auth.uid() = assigned_by);

CREATE POLICY "Users can update tasks assigned to or by them"
ON public.tasks FOR UPDATE
USING (auth.uid() = assigned_to OR auth.uid() = assigned_by);

CREATE POLICY "Users can delete tasks they created"
ON public.tasks FOR DELETE
USING (auth.uid() = assigned_by);

-- Trigger for updated_at
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
