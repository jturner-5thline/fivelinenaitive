
-- Feature 2: Email Designer + Templates
CREATE TABLE email_templates_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'personal',
  scope TEXT NOT NULL DEFAULT 'both',
  template_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  subject_template TEXT,
  preview_text_template TEXT,
  is_locked BOOLEAN DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE email_templates_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view templates"
  ON email_templates_v2 FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id) OR public.is_5thline_user(auth.uid()));

CREATE POLICY "Company members can insert templates"
  ON email_templates_v2 FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id) OR public.is_5thline_user(auth.uid()));

CREATE POLICY "Company members can update templates"
  ON email_templates_v2 FOR UPDATE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id) OR public.is_5thline_user(auth.uid()));

CREATE POLICY "Company members can delete templates"
  ON email_templates_v2 FOR DELETE TO authenticated
  USING (
    (public.is_company_admin(auth.uid(), company_id) OR created_by = auth.uid())
    OR public.is_5thline_user(auth.uid())
  );

CREATE TABLE email_block_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  block_json JSONB NOT NULL,
  category TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE email_block_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can manage blocks"
  ON email_block_library FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), company_id) OR public.is_5thline_user(auth.uid()));

-- Feature 5: Video Library
CREATE TABLE video_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  duration_seconds INTEGER,
  level TEXT DEFAULT 'intro',
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE video_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view published videos"
  ON video_resources FOR SELECT TO authenticated
  USING (status = 'published' OR public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage videos"
  ON video_resources FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TABLE video_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_resource_id UUID NOT NULL REFERENCES video_resources(id) ON DELETE CASCADE,
  user_id UUID,
  company_id UUID,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE video_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own views"
  ON video_views FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view own views"
  ON video_views FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "Users can update own views"
  ON video_views FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- Feature 7: Clean Distribution Stats
CREATE TABLE organization_tracking_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE UNIQUE,
  internal_domains TEXT[] DEFAULT '{}',
  internal_ip_ranges TEXT[] DEFAULT '{}',
  exclude_bot_traffic BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE organization_tracking_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage tracking settings"
  ON organization_tracking_settings FOR ALL TO authenticated
  USING (public.is_company_admin(auth.uid(), company_id) OR public.is_5thline_user(auth.uid()));

CREATE TABLE email_distribution_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distribution_id UUID NOT NULL,
  company_id UUID NOT NULL REFERENCES companies(id),
  raw_sends INTEGER DEFAULT 0,
  raw_opens INTEGER DEFAULT 0,
  raw_unique_opens INTEGER DEFAULT 0,
  raw_clicks INTEGER DEFAULT 0,
  raw_bounces INTEGER DEFAULT 0,
  clean_sends INTEGER DEFAULT 0,
  clean_opens INTEGER DEFAULT 0,
  clean_unique_opens INTEGER DEFAULT 0,
  clean_clicks INTEGER DEFAULT 0,
  clean_bounces INTEGER DEFAULT 0,
  clean_open_rate NUMERIC(5,2),
  clean_click_rate NUMERIC(5,2),
  computed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (distribution_id, company_id)
);

ALTER TABLE email_distribution_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view distribution stats"
  ON email_distribution_stats FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id) OR public.is_5thline_user(auth.uid()));

CREATE POLICY "Service role can manage distribution stats"
  ON email_distribution_stats FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_5thline_user(auth.uid()));

-- Triggers for updated_at
CREATE TRIGGER update_email_templates_v2_updated_at
  BEFORE UPDATE ON email_templates_v2
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_block_library_updated_at
  BEFORE UPDATE ON email_block_library
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_video_resources_updated_at
  BEFORE UPDATE ON video_resources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_org_tracking_settings_updated_at
  BEFORE UPDATE ON organization_tracking_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
