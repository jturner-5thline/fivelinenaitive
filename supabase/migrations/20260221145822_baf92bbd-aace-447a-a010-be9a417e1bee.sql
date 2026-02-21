
-- Task Labels
CREATE TABLE public.task_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.task_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view labels in their company"
  ON public.task_labels FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can create labels in their company"
  ON public.task_labels FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete labels they created"
  ON public.task_labels FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_company_admin(auth.uid(), company_id));

-- Task Label Assignments (junction)
CREATE TABLE public.task_label_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,
  label_id UUID REFERENCES public.task_labels(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id, label_id)
);

ALTER TABLE public.task_label_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view label assignments for their tasks"
  ON public.task_label_assignments FOR SELECT TO authenticated
  USING (task_id IN (SELECT id FROM public.tasks WHERE assigned_to = auth.uid() OR assigned_by = auth.uid()));

CREATE POLICY "Users can assign labels to their tasks"
  ON public.task_label_assignments FOR INSERT TO authenticated
  WITH CHECK (task_id IN (SELECT id FROM public.tasks WHERE assigned_to = auth.uid() OR assigned_by = auth.uid()));

CREATE POLICY "Users can remove labels from their tasks"
  ON public.task_label_assignments FOR DELETE TO authenticated
  USING (task_id IN (SELECT id FROM public.tasks WHERE assigned_to = auth.uid() OR assigned_by = auth.uid()));

-- Task Dependencies
CREATE TABLE public.task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,
  depends_on_task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,
  dependency_type TEXT NOT NULL DEFAULT 'blocked_by',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id, depends_on_task_id),
  CHECK (task_id != depends_on_task_id)
);

ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view dependencies for their tasks"
  ON public.task_dependencies FOR SELECT TO authenticated
  USING (task_id IN (SELECT id FROM public.tasks WHERE assigned_to = auth.uid() OR assigned_by = auth.uid())
    OR depends_on_task_id IN (SELECT id FROM public.tasks WHERE assigned_to = auth.uid() OR assigned_by = auth.uid()));

CREATE POLICY "Users can create dependencies for their tasks"
  ON public.task_dependencies FOR INSERT TO authenticated
  WITH CHECK (task_id IN (SELECT id FROM public.tasks WHERE assigned_to = auth.uid() OR assigned_by = auth.uid()));

CREATE POLICY "Users can delete dependencies for their tasks"
  ON public.task_dependencies FOR DELETE TO authenticated
  USING (task_id IN (SELECT id FROM public.tasks WHERE assigned_to = auth.uid() OR assigned_by = auth.uid()));

-- Time Entries
CREATE TABLE public.task_time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  duration_minutes INTEGER NOT NULL,
  description TEXT,
  logged_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.task_time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view time entries for their tasks"
  ON public.task_time_entries FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR task_id IN (SELECT id FROM public.tasks WHERE assigned_to = auth.uid() OR assigned_by = auth.uid()));

CREATE POLICY "Users can log time"
  ON public.task_time_entries FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their time entries"
  ON public.task_time_entries FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Task Attachments
CREATE TABLE public.task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  content_type TEXT,
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view attachments for their tasks"
  ON public.task_attachments FOR SELECT TO authenticated
  USING (task_id IN (SELECT id FROM public.tasks WHERE assigned_to = auth.uid() OR assigned_by = auth.uid()));

CREATE POLICY "Users can upload attachments"
  ON public.task_attachments FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "Users can delete their attachments"
  ON public.task_attachments FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid());

-- Task Templates
CREATE TABLE public.task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  template_tasks JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view templates in their company"
  ON public.task_templates FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can create templates"
  ON public.task_templates FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can update their templates"
  ON public.task_templates FOR UPDATE TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Users can delete their templates"
  ON public.task_templates FOR DELETE TO authenticated
  USING (created_by = auth.uid());

-- Saved Views
CREATE TABLE public.task_saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  view_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.task_saved_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their saved views"
  ON public.task_saved_views FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Add recurring task columns to tasks table
ALTER TABLE public.tasks 
  ADD COLUMN IF NOT EXISTS recurrence_rule TEXT,
  ADD COLUMN IF NOT EXISTS recurrence_parent_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT false;

-- Add storage bucket for task attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('task-attachments', 'task-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS for task-attachments bucket
CREATE POLICY "Users can upload task attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'task-attachments');

CREATE POLICY "Users can view task attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'task-attachments');

CREATE POLICY "Users can delete their task attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'task-attachments');
