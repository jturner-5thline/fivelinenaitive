-- Create template versions table
CREATE TABLE public.template_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.workflow_templates(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  tags TEXT[] DEFAULT '{}',
  change_summary TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create template favorites table
CREATE TABLE public.template_favorites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  template_id UUID NOT NULL REFERENCES public.workflow_templates(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, template_id)
);

-- Enable RLS
ALTER TABLE public.template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_favorites ENABLE ROW LEVEL SECURITY;

-- RLS policies for template_versions
CREATE POLICY "Users can view versions of their own templates"
  ON public.template_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workflow_templates wt
      WHERE wt.id = template_id AND wt.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view versions of shared templates"
  ON public.template_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workflow_templates wt
      JOIN public.company_members cm ON wt.company_id = cm.company_id
      WHERE wt.id = template_id AND wt.is_shared = true AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create versions for their own templates"
  ON public.template_versions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workflow_templates wt
      WHERE wt.id = template_id AND wt.user_id = auth.uid()
    )
  );

-- RLS policies for template_favorites
CREATE POLICY "Users can view their own favorites"
  ON public.template_favorites FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can add their own favorites"
  ON public.template_favorites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove their own favorites"
  ON public.template_favorites FOR DELETE
  USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX idx_template_versions_template_id ON public.template_versions(template_id);
CREATE INDEX idx_template_versions_version_number ON public.template_versions(template_id, version_number DESC);
CREATE INDEX idx_template_favorites_user_id ON public.template_favorites(user_id);
CREATE INDEX idx_template_favorites_template_id ON public.template_favorites(template_id);