-- 1. Create supporting tables first
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  icon TEXT DEFAULT '📋',
  status TEXT NOT NULL DEFAULT 'active',
  default_view TEXT DEFAULT 'list',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.project_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

CREATE TABLE public.project_sections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.task_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Extend existing tasks table
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES public.project_sections(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS task_type TEXT NOT NULL DEFAULT 'task';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES auth.users(id);
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- 3. Create join tables
CREATE TABLE public.task_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, project_id)
);

CREATE TABLE public.task_tag_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.task_tags(id) ON DELETE CASCADE,
  UNIQUE (task_id, tag_id)
);

CREATE TABLE public.task_followers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, user_id)
);

CREATE TABLE public.task_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id),
  body TEXT NOT NULL,
  is_edited BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.task_activity (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES auth.users(id),
  event_type TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. RLS on new tables
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_followers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View projects" ON public.projects FOR SELECT USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));
CREATE POLICY "Manage projects" ON public.projects FOR ALL USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "View project members" ON public.project_members FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())));
CREATE POLICY "Manage project members" ON public.project_members FOR ALL USING (project_id IN (SELECT id FROM public.projects WHERE company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())));

CREATE POLICY "View sections" ON public.project_sections FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())));
CREATE POLICY "Manage sections" ON public.project_sections FOR ALL USING (project_id IN (SELECT id FROM public.projects WHERE company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())));

CREATE POLICY "View tags" ON public.task_tags FOR SELECT USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));
CREATE POLICY "Manage tags" ON public.task_tags FOR ALL USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "View task projects" ON public.task_projects FOR SELECT USING (task_id IN (SELECT id FROM public.tasks WHERE company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())));
CREATE POLICY "Manage task projects" ON public.task_projects FOR ALL USING (task_id IN (SELECT id FROM public.tasks WHERE company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())));

CREATE POLICY "View task tags" ON public.task_tag_assignments FOR SELECT USING (task_id IN (SELECT id FROM public.tasks WHERE company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())));
CREATE POLICY "Manage task tags" ON public.task_tag_assignments FOR ALL USING (task_id IN (SELECT id FROM public.tasks WHERE company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())));

CREATE POLICY "View followers" ON public.task_followers FOR SELECT USING (task_id IN (SELECT id FROM public.tasks WHERE company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())));
CREATE POLICY "Manage followers" ON public.task_followers FOR ALL USING (task_id IN (SELECT id FROM public.tasks WHERE company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())));

CREATE POLICY "View comments" ON public.task_comments FOR SELECT USING (task_id IN (SELECT id FROM public.tasks WHERE company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())));
CREATE POLICY "Insert comments" ON public.task_comments FOR INSERT WITH CHECK (author_id = auth.uid());
CREATE POLICY "Update own comments" ON public.task_comments FOR UPDATE USING (author_id = auth.uid());
CREATE POLICY "Delete own comments" ON public.task_comments FOR DELETE USING (author_id = auth.uid());

CREATE POLICY "View activity" ON public.task_activity FOR SELECT USING (task_id IN (SELECT id FROM public.tasks WHERE company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())));
CREATE POLICY "Insert activity" ON public.task_activity FOR INSERT WITH CHECK (actor_id = auth.uid());

-- 5. Triggers
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_sections_updated_at BEFORE UPDATE ON public.project_sections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_task_comments_updated_at BEFORE UPDATE ON public.task_comments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();