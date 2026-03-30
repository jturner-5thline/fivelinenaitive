-- Create task_view_tabs table for user-configurable task tabs
CREATE TABLE public.task_view_tabs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  filter_config JSONB NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  icon TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.task_view_tabs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own task tabs"
ON public.task_view_tabs
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_task_view_tabs_user ON public.task_view_tabs(user_id, sort_order);