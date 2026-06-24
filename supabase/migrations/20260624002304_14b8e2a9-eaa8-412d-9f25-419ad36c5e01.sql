
-- ============================================================
-- agent_templates: restrict reads to provisioned company members
-- ============================================================
DROP POLICY IF EXISTS "Agent templates are viewable by authenticated users" ON public.agent_templates;
CREATE POLICY "Agent templates readable by company members"
  ON public.agent_templates
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.user_id = auth.uid()));

-- ============================================================
-- business_holidays: restrict reads to company members
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view business holidays" ON public.business_holidays;
CREATE POLICY "Business holidays readable by company members"
  ON public.business_holidays
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.user_id = auth.uid()));

-- ============================================================
-- channel_types: restrict reads to company members
-- ============================================================
DROP POLICY IF EXISTS "channel_types_select_auth" ON public.channel_types;
CREATE POLICY "channel_types_select_company_members"
  ON public.channel_types
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.user_id = auth.uid()));

-- ============================================================
-- email_templates: restrict reads to company members
-- ============================================================
DROP POLICY IF EXISTS "Anyone can read email templates" ON public.email_templates;
CREATE POLICY "Email templates readable by company members"
  ON public.email_templates
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.user_id = auth.uid()));

-- ============================================================
-- feature_flags: restrict reads to company members
-- ============================================================
DROP POLICY IF EXISTS "Anyone can read feature flags" ON public.feature_flags;
CREATE POLICY "Feature flags readable by company members"
  ON public.feature_flags
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.user_id = auth.uid()));

-- ============================================================
-- system_announcements: enforce role-targeting + active window
-- ============================================================
DROP POLICY IF EXISTS "Anyone can read active announcements" ON public.system_announcements;
CREATE POLICY "Active announcements readable for targeted roles"
  ON public.system_announcements
  FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND (show_from IS NULL OR show_from <= now())
    AND (show_until IS NULL OR show_until >= now())
    AND (
      target_roles IS NULL
      OR array_length(target_roles, 1) IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role::text = ANY (target_roles)
      )
    )
  );

-- ============================================================
-- dashboard_kpi_plans: restrict to 5th Line members / admins
-- ============================================================
DROP POLICY IF EXISTS "kpi_plans_select_authed" ON public.dashboard_kpi_plans;
CREATE POLICY "kpi_plans_select_internal"
  ON public.dashboard_kpi_plans
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid
    )
  );

-- ============================================================
-- sales_bd_rules: restrict to 5th Line members / admins
-- ============================================================
DROP POLICY IF EXISTS "sales_bd_rules_select_auth" ON public.sales_bd_rules;
CREATE POLICY "sales_bd_rules_select_internal"
  ON public.sales_bd_rules
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid
    )
  );

-- ============================================================
-- platform_settings: restrict to admins / 5th Line members
-- ============================================================
DROP POLICY IF EXISTS "All authenticated users can read platform settings" ON public.platform_settings;
CREATE POLICY "Platform settings readable by admins or 5th Line"
  ON public.platform_settings
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid
    )
  );

-- ============================================================
-- system_settings: restrict to admins / 5th Line members
-- ============================================================
DROP POLICY IF EXISTS "Anyone can read system settings" ON public.system_settings;
CREATE POLICY "System settings readable by admins or 5th Line"
  ON public.system_settings
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid
    )
  );

-- ============================================================
-- lender-attachments storage: let company members download files,
-- not just the uploader. Mirrors the deal-attachments pattern by
-- joining storage objects back to the lender_attachments row.
-- ============================================================
DROP POLICY IF EXISTS "Users can view their lender attachments" ON storage.objects;
CREATE POLICY "Company members can view lender attachment files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'lender-attachments'
    AND EXISTS (
      SELECT 1
      FROM public.lender_attachments la
      WHERE la.file_path = storage.objects.name
        AND (
          la.user_id = auth.uid()
          OR (la.company_id IS NOT NULL AND public.is_company_member(auth.uid(), la.company_id))
        )
    )
  );

-- ============================================================
-- realtime.messages: enable RLS so channel subscriptions are
-- gated to authenticated users that belong to a company.
-- ============================================================
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can subscribe to realtime" ON realtime.messages;
CREATE POLICY "Company members can subscribe to realtime"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.user_id = auth.uid()));

DROP POLICY IF EXISTS "Company members can broadcast realtime" ON realtime.messages;
CREATE POLICY "Company members can broadcast realtime"
  ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.user_id = auth.uid()));
