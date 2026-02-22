
-- Add starred/pinned column to tasks
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS is_starred BOOLEAN NOT NULL DEFAULT false;

-- Add recurrence columns to tasks
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS recurrence_rule TEXT; -- e.g. 'daily', 'weekly', 'monthly', 'weekdays'
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS recurrence_source_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL;

-- Create task_watchers table
CREATE TABLE IF NOT EXISTS public.task_watchers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(task_id, user_id)
);

-- Enable RLS on task_watchers
ALTER TABLE public.task_watchers ENABLE ROW LEVEL SECURITY;

-- RLS: users can see watchers for tasks in their company
CREATE POLICY "Users can view task watchers" ON public.task_watchers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.company_members cm ON cm.company_id = t.company_id
      WHERE t.id = task_watchers.task_id AND cm.user_id = auth.uid()
    )
  );

-- RLS: users can add/remove themselves as watchers
CREATE POLICY "Users can manage own watch status" ON public.task_watchers
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
