
-- HubSpot integration config
CREATE TABLE public.hubspot_integration_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  type TEXT NOT NULL DEFAULT 'hubspot_deals',
  status TEXT NOT NULL DEFAULT 'disabled' CHECK (status IN ('enabled', 'disabled', 'failing')),
  direction TEXT NOT NULL DEFAULT 'hubspot_to_native' CHECK (direction IN ('native_to_hubspot', 'hubspot_to_native', 'bidirectional')),
  record_behavior TEXT NOT NULL DEFAULT 'create_and_update' CHECK (record_behavior IN ('create_only', 'update_only', 'create_and_update')),
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, type)
);

-- Field mappings
CREATE TABLE public.hubspot_field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_config_id UUID NOT NULL REFERENCES public.hubspot_integration_configs(id) ON DELETE CASCADE,
  external_object TEXT NOT NULL DEFAULT 'hubspot_deal',
  external_field_name TEXT NOT NULL,
  native_object TEXT NOT NULL DEFAULT 'native_deal',
  native_field_name TEXT NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(integration_config_id, external_field_name)
);

-- Sync runs for monitoring
CREATE TABLE public.hubspot_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_config_id UUID NOT NULL REFERENCES public.hubspot_integration_configs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('success', 'failure', 'running')),
  records_processed INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  error_summary JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

-- RLS
ALTER TABLE public.hubspot_integration_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hubspot_field_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hubspot_sync_runs ENABLE ROW LEVEL SECURITY;

-- Policies for hubspot_integration_configs
CREATE POLICY "Users can view own company configs" ON public.hubspot_integration_configs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own configs" ON public.hubspot_integration_configs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own company configs" ON public.hubspot_integration_configs
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_company_admin(auth.uid(), company_id));

CREATE POLICY "Users can delete own configs" ON public.hubspot_integration_configs
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Policies for field mappings (based on parent config access)
CREATE POLICY "Users can manage field mappings" ON public.hubspot_field_mappings
  FOR ALL TO authenticated
  USING (integration_config_id IN (SELECT id FROM public.hubspot_integration_configs WHERE user_id = auth.uid() OR company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())));

-- Policies for sync runs
CREATE POLICY "Users can view sync runs" ON public.hubspot_sync_runs
  FOR ALL TO authenticated
  USING (integration_config_id IN (SELECT id FROM public.hubspot_integration_configs WHERE user_id = auth.uid() OR company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())));

-- Updated_at triggers
CREATE TRIGGER update_hubspot_integration_configs_updated_at
  BEFORE UPDATE ON public.hubspot_integration_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_hubspot_field_mappings_updated_at
  BEFORE UPDATE ON public.hubspot_field_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
