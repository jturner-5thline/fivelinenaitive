
-- Drop existing user-scoped policies
DROP POLICY IF EXISTS "Users manage own asana sync config" ON public.asana_sync_config;
DROP POLICY IF EXISTS "Users manage own asana project filters" ON public.asana_project_filters;
DROP POLICY IF EXISTS "Users manage own asana field mappings" ON public.asana_field_mappings;
DROP POLICY IF EXISTS "Users manage own asana status mappings" ON public.asana_status_mappings;

-- Add company_id to asana_sync_config for company-scoped access
ALTER TABLE public.asana_sync_config ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);

-- Company admins can manage asana sync config
CREATE POLICY "Company admins manage asana sync config" ON public.asana_sync_config
  FOR ALL TO authenticated
  USING (public.is_company_admin(auth.uid(), company_id))
  WITH CHECK (public.is_company_admin(auth.uid(), company_id));

-- Platform admins can also manage
CREATE POLICY "Platform admins manage asana sync config" ON public.asana_sync_config
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Child tables: company admin via sync_config join
CREATE POLICY "Company admins manage asana project filters" ON public.asana_project_filters
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.asana_sync_config c WHERE c.id = sync_config_id AND public.is_company_admin(auth.uid(), c.company_id))
    OR public.is_admin(auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.asana_sync_config c WHERE c.id = sync_config_id AND public.is_company_admin(auth.uid(), c.company_id))
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "Company admins manage asana field mappings" ON public.asana_field_mappings
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.asana_sync_config c WHERE c.id = sync_config_id AND public.is_company_admin(auth.uid(), c.company_id))
    OR public.is_admin(auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.asana_sync_config c WHERE c.id = sync_config_id AND public.is_company_admin(auth.uid(), c.company_id))
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "Company admins manage asana status mappings" ON public.asana_status_mappings
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.asana_sync_config c WHERE c.id = sync_config_id AND public.is_company_admin(auth.uid(), c.company_id))
    OR public.is_admin(auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.asana_sync_config c WHERE c.id = sync_config_id AND public.is_company_admin(auth.uid(), c.company_id))
    OR public.is_admin(auth.uid())
  );
