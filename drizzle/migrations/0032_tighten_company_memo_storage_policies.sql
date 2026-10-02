-- companies: creator must be the caller
ALTER TABLE public.companies ALTER COLUMN created_by SET DEFAULT auth.uid();
DROP POLICY IF EXISTS "Authenticated users can create company" ON public.companies;
CREATE POLICY "Authenticated users can create company" ON public.companies
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

-- deal_memo_audit_logs: own rows on deals in the caller's company
DROP POLICY IF EXISTS "Authenticated users can insert memo audit logs" ON public.deal_memo_audit_logs;
CREATE POLICY "Authenticated users can insert memo audit logs" ON public.deal_memo_audit_logs
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.deals d JOIN public.company_members cm ON cm.company_id = d.company_id
      WHERE d.id = deal_memo_audit_logs.deal_id AND cm.user_id = auth.uid()
    )
  );

-- company-logos: scope to the caller's own company folder
DROP POLICY IF EXISTS "Authenticated users can view company logos" ON storage.objects;
DROP POLICY IF EXISTS "Company admins can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Company admins can update logos" ON storage.objects;
DROP POLICY IF EXISTS "Company admins can delete logos" ON storage.objects;

CREATE POLICY "Authenticated users can view company logos" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'company-logos' AND EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = (SELECT auth.uid()) AND cm.company_id::text = (storage.foldername(name))[1]
    )
  );
CREATE POLICY "Company admins can upload logos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'company-logos' AND EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = (SELECT auth.uid()) AND cm.company_id::text = (storage.foldername(name))[1]
        AND cm.role IN ('owner'::public.company_role, 'admin'::public.company_role)
    )
  );
CREATE POLICY "Company admins can update logos" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'company-logos' AND EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = (SELECT auth.uid()) AND cm.company_id::text = (storage.foldername(name))[1]
        AND cm.role IN ('owner'::public.company_role, 'admin'::public.company_role)
    )
  ) WITH CHECK (
    bucket_id = 'company-logos' AND EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = (SELECT auth.uid()) AND cm.company_id::text = (storage.foldername(name))[1]
        AND cm.role IN ('owner'::public.company_role, 'admin'::public.company_role)
    )
  );
CREATE POLICY "Company admins can delete logos" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'company-logos' AND EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = (SELECT auth.uid()) AND cm.company_id::text = (storage.foldername(name))[1]
        AND cm.role IN ('owner'::public.company_role, 'admin'::public.company_role)
    )
  );

-- Public buckets: files stay reachable by public URL; listing is restricted
DROP POLICY IF EXISTS "Public read for email-signatures" ON storage.objects;
CREATE POLICY "Public read for email-signatures" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'email-signatures' AND owner_id = (SELECT auth.uid()::text)
  );

DROP POLICY IF EXISTS "Public can view blog media" ON storage.objects;
CREATE POLICY "Public can view blog media" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'blog-media' AND public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  );