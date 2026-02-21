
-- Report Definitions (widget-based report builder)
CREATE TABLE public.report_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  owner_user_id UUID NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  visibility TEXT NOT NULL DEFAULT 'private',
  shared_with_user_ids UUID[] DEFAULT '{}',
  data_sources TEXT[] NOT NULL DEFAULT '{"deals"}',
  global_filters JSONB DEFAULT '{}',
  layout_config JSONB DEFAULT '{"columns": 2}',
  is_locked BOOLEAN DEFAULT false,
  ai_summary_enabled BOOLEAN DEFAULT false,
  ai_regenerate_on_run BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.report_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own report definitions" ON public.report_definitions
  FOR ALL TO authenticated
  USING (owner_user_id = auth.uid());

CREATE POLICY "Users can view shared report definitions" ON public.report_definitions
  FOR SELECT TO authenticated
  USING (
    (visibility = 'org' AND company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    ))
    OR auth.uid() = ANY(shared_with_user_ids)
  );

CREATE TRIGGER update_report_definitions_updated_at
  BEFORE UPDATE ON public.report_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Report Widgets
CREATE TABLE public.report_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.report_definitions(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  width INTEGER NOT NULL DEFAULT 1,
  query_config JSONB DEFAULT '{}',
  visualization_config JSONB DEFAULT '{}',
  ai_annotation TEXT,
  ai_annotation_sources JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.report_widgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Widgets follow report owner access" ON public.report_widgets
  FOR ALL TO authenticated
  USING (
    report_id IN (SELECT id FROM public.report_definitions WHERE owner_user_id = auth.uid())
  );

CREATE POLICY "Widgets viewable for shared reports" ON public.report_widgets
  FOR SELECT TO authenticated
  USING (
    report_id IN (
      SELECT id FROM public.report_definitions 
      WHERE (visibility = 'org' AND company_id IN (
        SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
      ))
      OR auth.uid() = ANY(shared_with_user_ids)
    )
  );

CREATE TRIGGER update_report_widgets_updated_at
  BEFORE UPDATE ON public.report_widgets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add report_definition_id to scheduled_reports for linking
ALTER TABLE public.scheduled_reports 
  ADD COLUMN IF NOT EXISTS report_definition_id UUID REFERENCES public.report_definitions(id) ON DELETE SET NULL;

-- Add columns to report_runs for richer data
ALTER TABLE public.report_runs
  ADD COLUMN IF NOT EXISTS ai_narrative TEXT,
  ADD COLUMN IF NOT EXISTS ai_sources JSONB,
  ADD COLUMN IF NOT EXISTS run_type TEXT DEFAULT 'scheduled';
