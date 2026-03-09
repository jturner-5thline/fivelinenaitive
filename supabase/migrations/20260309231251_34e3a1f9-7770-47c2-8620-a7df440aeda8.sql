
-- Asana sync configuration per integration
CREATE TABLE public.asana_sync_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  sync_direction TEXT NOT NULL DEFAULT 'both' CHECK (sync_direction IN ('asana_to_platform', 'platform_to_asana', 'both')),
  auto_sync_enabled BOOLEAN NOT NULL DEFAULT false,
  auto_sync_interval_minutes INTEGER NOT NULL DEFAULT 60,
  sync_on_task_create BOOLEAN NOT NULL DEFAULT true,
  sync_on_task_update BOOLEAN NOT NULL DEFAULT true,
  sync_on_task_complete BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(integration_id)
);

-- Asana project filters (which projects to sync)
CREATE TABLE public.asana_project_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_config_id UUID NOT NULL REFERENCES public.asana_sync_config(id) ON DELETE CASCADE,
  asana_project_gid TEXT NOT NULL,
  asana_project_name TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  map_to TEXT NOT NULL DEFAULT 'deals' CHECK (map_to IN ('deals', 'milestones', 'tasks')),
  pipeline_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(sync_config_id, asana_project_gid)
);

-- Asana field mappings
CREATE TABLE public.asana_field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_config_id UUID NOT NULL REFERENCES public.asana_sync_config(id) ON DELETE CASCADE,
  asana_field TEXT NOT NULL,
  platform_field TEXT NOT NULL,
  platform_entity TEXT NOT NULL DEFAULT 'deal' CHECK (platform_entity IN ('deal', 'milestone', 'task', 'deal_lender')),
  transform_type TEXT DEFAULT 'direct' CHECK (transform_type IN ('direct', 'lookup', 'template')),
  transform_config JSONB,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(sync_config_id, asana_field, platform_entity)
);

-- Asana status mappings
CREATE TABLE public.asana_status_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_config_id UUID NOT NULL REFERENCES public.asana_sync_config(id) ON DELETE CASCADE,
  asana_section_name TEXT NOT NULL,
  asana_project_gid TEXT,
  platform_entity TEXT NOT NULL DEFAULT 'deal' CHECK (platform_entity IN ('deal', 'milestone', 'task')),
  platform_status TEXT NOT NULL,
  platform_stage_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(sync_config_id, asana_section_name, platform_entity)
);

-- RLS
ALTER TABLE public.asana_sync_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asana_project_filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asana_field_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asana_status_mappings ENABLE ROW LEVEL SECURITY;

-- Policies: users can manage their own sync config
CREATE POLICY "Users manage own asana sync config" ON public.asana_sync_config
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users manage own asana project filters" ON public.asana_project_filters
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.asana_sync_config c WHERE c.id = sync_config_id AND c.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.asana_sync_config c WHERE c.id = sync_config_id AND c.user_id = auth.uid())
  );

CREATE POLICY "Users manage own asana field mappings" ON public.asana_field_mappings
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.asana_sync_config c WHERE c.id = sync_config_id AND c.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.asana_sync_config c WHERE c.id = sync_config_id AND c.user_id = auth.uid())
  );

CREATE POLICY "Users manage own asana status mappings" ON public.asana_status_mappings
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.asana_sync_config c WHERE c.id = sync_config_id AND c.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.asana_sync_config c WHERE c.id = sync_config_id AND c.user_id = auth.uid())
  );

-- Updated at trigger
CREATE TRIGGER update_asana_sync_config_updated_at
  BEFORE UPDATE ON public.asana_sync_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
