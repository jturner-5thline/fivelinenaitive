
-- HubSpot Field Metadata table
CREATE TABLE public.hubspot_field_metadata (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  object_type TEXT NOT NULL CHECK (object_type IN ('contact', 'company')),
  internal_name TEXT NOT NULL,
  label TEXT NOT NULL,
  hubspot_type TEXT,
  hubspot_field_type TEXT,
  options JSONB,
  group_name TEXT,
  is_read_only BOOLEAN NOT NULL DEFAULT false,
  is_system BOOLEAN NOT NULL DEFAULT false,
  mapped_column_name TEXT,
  mapped_column_type TEXT,
  is_mapped BOOLEAN NOT NULL DEFAULT false,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(object_type, internal_name, company_id)
);

-- Layout Configs table
CREATE TABLE public.hubspot_layout_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  object_type TEXT NOT NULL CHECK (object_type IN ('contact', 'company')),
  name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Layout Sections table
CREATE TABLE public.hubspot_layout_sections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  layout_id UUID NOT NULL REFERENCES public.hubspot_layout_configs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_collapsed_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Layout Section Fields table
CREATE TABLE public.hubspot_layout_section_fields (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  section_id UUID NOT NULL REFERENCES public.hubspot_layout_sections(id) ON DELETE CASCADE,
  field_metadata_id UUID NOT NULL REFERENCES public.hubspot_field_metadata(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  is_required BOOLEAN NOT NULL DEFAULT false,
  column_span INTEGER NOT NULL DEFAULT 1 CHECK (column_span IN (1, 2)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.hubspot_field_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hubspot_layout_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hubspot_layout_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hubspot_layout_section_fields ENABLE ROW LEVEL SECURITY;

-- RLS policies: company members can read, admins can write
CREATE POLICY "Company members can view field metadata"
  ON public.hubspot_field_metadata FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Company admins can manage field metadata"
  ON public.hubspot_field_metadata FOR ALL TO authenticated
  USING (public.is_company_admin(auth.uid(), company_id))
  WITH CHECK (public.is_company_admin(auth.uid(), company_id));

CREATE POLICY "Company members can view layout configs"
  ON public.hubspot_layout_configs FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Company admins can manage layout configs"
  ON public.hubspot_layout_configs FOR ALL TO authenticated
  USING (public.is_company_admin(auth.uid(), company_id))
  WITH CHECK (public.is_company_admin(auth.uid(), company_id));

CREATE POLICY "Company members can view layout sections"
  ON public.hubspot_layout_sections FOR SELECT TO authenticated
  USING (layout_id IN (
    SELECT id FROM public.hubspot_layout_configs 
    WHERE company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
  ));

CREATE POLICY "Company admins can manage layout sections"
  ON public.hubspot_layout_sections FOR ALL TO authenticated
  USING (layout_id IN (
    SELECT id FROM public.hubspot_layout_configs WHERE public.is_company_admin(auth.uid(), company_id)
  ))
  WITH CHECK (layout_id IN (
    SELECT id FROM public.hubspot_layout_configs WHERE public.is_company_admin(auth.uid(), company_id)
  ));

CREATE POLICY "Company members can view section fields"
  ON public.hubspot_layout_section_fields FOR SELECT TO authenticated
  USING (section_id IN (
    SELECT s.id FROM public.hubspot_layout_sections s
    JOIN public.hubspot_layout_configs c ON c.id = s.layout_id
    WHERE c.company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
  ));

CREATE POLICY "Company admins can manage section fields"
  ON public.hubspot_layout_section_fields FOR ALL TO authenticated
  USING (section_id IN (
    SELECT s.id FROM public.hubspot_layout_sections s
    JOIN public.hubspot_layout_configs c ON c.id = s.layout_id
    WHERE public.is_company_admin(auth.uid(), c.company_id)
  ))
  WITH CHECK (section_id IN (
    SELECT s.id FROM public.hubspot_layout_sections s
    JOIN public.hubspot_layout_configs c ON c.id = s.layout_id
    WHERE public.is_company_admin(auth.uid(), c.company_id)
  ));

-- Updated_at triggers
CREATE TRIGGER set_updated_at_hubspot_field_metadata BEFORE UPDATE ON public.hubspot_field_metadata
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_updated_at_hubspot_layout_configs BEFORE UPDATE ON public.hubspot_layout_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_updated_at_hubspot_layout_sections BEFORE UPDATE ON public.hubspot_layout_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_updated_at_hubspot_layout_section_fields BEFORE UPDATE ON public.hubspot_layout_section_fields
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
