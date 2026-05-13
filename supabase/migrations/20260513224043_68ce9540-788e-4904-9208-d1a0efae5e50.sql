
-- =====================================================================
-- Security hardening: lock down overly-permissive RLS and storage policies
-- =====================================================================

-- 1. pending_deal_notifications: require company membership on INSERT
DROP POLICY IF EXISTS "Users can insert pending deal notifications" ON public.pending_deal_notifications;
CREATE POLICY "Users can insert pending deal notifications"
  ON public.pending_deal_notifications FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
  );

-- 2. pending_lender_notifications: same fix
DROP POLICY IF EXISTS "Users can insert pending lender notifications" ON public.pending_lender_notifications;
CREATE POLICY "Users can insert pending lender notifications"
  ON public.pending_lender_notifications FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
  );

-- 3. client_request_audit_log: scope INSERT to draft's company + self
DROP POLICY IF EXISTS "Users can create audit log entries" ON public.client_request_audit_log;
CREATE POLICY "Users can create audit log entries"
  ON public.client_request_audit_log FOR INSERT TO authenticated
  WITH CHECK (
    performed_by = auth.uid()
    AND draft_id IN (
      SELECT id FROM public.client_request_drafts
      WHERE company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
    )
  );

-- 4. deal_advance_reasons: scope SELECT and INSERT by company membership
DROP POLICY IF EXISTS "View advance reasons for visible deals" ON public.deal_advance_reasons;
CREATE POLICY "View advance reasons for visible deals"
  ON public.deal_advance_reasons FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_advance_reasons.deal_id
        AND (d.user_id = auth.uid()
             OR (d.company_id IS NOT NULL AND public.is_company_member(auth.uid(), d.company_id)))
    )
  );

DROP POLICY IF EXISTS "Create advance reasons for visible deals" ON public.deal_advance_reasons;
CREATE POLICY "Create advance reasons for visible deals"
  ON public.deal_advance_reasons FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_advance_reasons.deal_id
        AND (d.user_id = auth.uid()
             OR (d.company_id IS NOT NULL AND public.is_company_member(auth.uid(), d.company_id)))
    )
  );

-- 5. naitive_pipeline_narrative_snapshots: scope SELECT/INSERT/DELETE by company
DROP POLICY IF EXISTS "Authenticated users can view narrative snapshots" ON public.naitive_pipeline_narrative_snapshots;
CREATE POLICY "Authenticated users can view narrative snapshots"
  ON public.naitive_pipeline_narrative_snapshots FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Authenticated users can insert narrative snapshots" ON public.naitive_pipeline_narrative_snapshots;
CREATE POLICY "Authenticated users can insert narrative snapshots"
  ON public.naitive_pipeline_narrative_snapshots FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Authenticated users can delete narrative snapshots" ON public.naitive_pipeline_narrative_snapshots;
CREATE POLICY "Authenticated users can delete narrative snapshots"
  ON public.naitive_pipeline_narrative_snapshots FOR DELETE TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
  );

-- 6. email_priority_signal_log: scope SELECT to deal's company members
DROP POLICY IF EXISTS "Authenticated users can view priority signal log" ON public.email_priority_signal_log;
CREATE POLICY "Authenticated users can view priority signal log"
  ON public.email_priority_signal_log FOR SELECT TO authenticated
  USING (
    detected_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = email_priority_signal_log.deal_id
        AND (d.user_id = auth.uid()
             OR (d.company_id IS NOT NULL AND public.is_company_member(auth.uid(), d.company_id)))
    )
  );

-- 7. asana_webhooks: scope ALL/SELECT to integration owner's company
DROP POLICY IF EXISTS "Authenticated users can manage asana webhooks" ON public.asana_webhooks;
DROP POLICY IF EXISTS "Authenticated users can view asana webhooks" ON public.asana_webhooks;

CREATE POLICY "Company members can view asana webhooks"
  ON public.asana_webhooks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.integrations i
      WHERE i.id = asana_webhooks.integration_id
        AND (i.user_id = auth.uid()
             OR (i.company_id IS NOT NULL AND public.is_company_member(auth.uid(), i.company_id)))
    )
  );

CREATE POLICY "Company members can manage asana webhooks"
  ON public.asana_webhooks FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.integrations i
      WHERE i.id = asana_webhooks.integration_id
        AND (i.user_id = auth.uid()
             OR (i.company_id IS NOT NULL AND public.is_company_member(auth.uid(), i.company_id)))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.integrations i
      WHERE i.id = asana_webhooks.integration_id
        AND (i.user_id = auth.uid()
             OR (i.company_id IS NOT NULL AND public.is_company_member(auth.uid(), i.company_id)))
    )
  );

-- 8. ai_styled_documents: scope SELECT to deal's company members
DROP POLICY IF EXISTS "Authenticated users can view styled documents" ON public.ai_styled_documents;
CREATE POLICY "Authenticated users can view styled documents"
  ON public.ai_styled_documents FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = ai_styled_documents.deal_id
        AND (d.user_id = auth.uid()
             OR (d.company_id IS NOT NULL AND public.is_company_member(auth.uid(), d.company_id)))
    )
  );

-- =====================================================================
-- Storage policy hardening
-- =====================================================================

-- 9. deal-attachments: remove "Anyone can ..." policies, replace with company-scoped
-- Path layout: ${user_id}/${deal_id}/${file}
DROP POLICY IF EXISTS "Anyone can view deal attachments" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload deal attachments" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete deal attachments" ON storage.objects;

CREATE POLICY "Company members can view deal attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'deal-attachments'
    AND EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id::text = (string_to_array(name, '/'))[2]
        AND (d.user_id = auth.uid()
             OR (d.company_id IS NOT NULL AND public.is_company_member(auth.uid(), d.company_id)))
    )
  );

CREATE POLICY "Company members can upload deal attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'deal-attachments'
    AND (string_to_array(name, '/'))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id::text = (string_to_array(name, '/'))[2]
        AND (d.user_id = auth.uid()
             OR (d.company_id IS NOT NULL AND public.is_company_member(auth.uid(), d.company_id)))
    )
  );

CREATE POLICY "Company members can delete deal attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'deal-attachments'
    AND EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id::text = (string_to_array(name, '/'))[2]
        AND (d.user_id = auth.uid()
             OR (d.company_id IS NOT NULL AND public.is_company_member(auth.uid(), d.company_id)))
    )
  );

-- 10. vdr-files: drop the four broad policies that bypass company scoping
DROP POLICY IF EXISTS "VDR files read" ON storage.objects;
DROP POLICY IF EXISTS "VDR files upload" ON storage.objects;
DROP POLICY IF EXISTS "VDR files update" ON storage.objects;
DROP POLICY IF EXISTS "VDR files delete" ON storage.objects;

-- 11. deal-files: scope by deal_id (path segment 1) -> company membership
DROP POLICY IF EXISTS "Authenticated users can read deal files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload deal files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update deal files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete deal files" ON storage.objects;

CREATE POLICY "Company members can read deal files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'deal-files'
    AND EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id::text = (string_to_array(name, '/'))[1]
        AND (d.user_id = auth.uid()
             OR (d.company_id IS NOT NULL AND public.is_company_member(auth.uid(), d.company_id)))
    )
  );

CREATE POLICY "Company members can upload deal files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'deal-files'
    AND EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id::text = (string_to_array(name, '/'))[1]
        AND (d.user_id = auth.uid()
             OR (d.company_id IS NOT NULL AND public.is_company_member(auth.uid(), d.company_id)))
    )
  );

CREATE POLICY "Company members can update deal files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'deal-files'
    AND EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id::text = (string_to_array(name, '/'))[1]
        AND (d.user_id = auth.uid()
             OR (d.company_id IS NOT NULL AND public.is_company_member(auth.uid(), d.company_id)))
    )
  );

CREATE POLICY "Company members can delete deal files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'deal-files'
    AND EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id::text = (string_to_array(name, '/'))[1]
        AND (d.user_id = auth.uid()
             OR (d.company_id IS NOT NULL AND public.is_company_member(auth.uid(), d.company_id)))
    )
  );

-- 12. task-attachments: scope by task_id (path segment 1) -> company membership
-- Path layout: ${task_id}/${file}
DROP POLICY IF EXISTS "Users can view task attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload task attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their task attachments" ON storage.objects;

CREATE POLICY "Company members can view task attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'task-attachments'
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      LEFT JOIN public.deals d ON d.id = t.deal_id
      WHERE t.id::text = (string_to_array(name, '/'))[1]
        AND (
          t.assigned_to = auth.uid()
          OR t.assigned_by = auth.uid()
          OR (t.company_id IS NOT NULL AND public.is_company_member(auth.uid(), t.company_id))
          OR (d.id IS NOT NULL AND (d.user_id = auth.uid()
              OR (d.company_id IS NOT NULL AND public.is_company_member(auth.uid(), d.company_id))))
        )
    )
  );

CREATE POLICY "Company members can upload task attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'task-attachments'
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      LEFT JOIN public.deals d ON d.id = t.deal_id
      WHERE t.id::text = (string_to_array(name, '/'))[1]
        AND (
          t.assigned_to = auth.uid()
          OR t.assigned_by = auth.uid()
          OR (t.company_id IS NOT NULL AND public.is_company_member(auth.uid(), t.company_id))
          OR (d.id IS NOT NULL AND (d.user_id = auth.uid()
              OR (d.company_id IS NOT NULL AND public.is_company_member(auth.uid(), d.company_id))))
        )
    )
  );

CREATE POLICY "Company members can delete task attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'task-attachments'
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      LEFT JOIN public.deals d ON d.id = t.deal_id
      WHERE t.id::text = (string_to_array(name, '/'))[1]
        AND (
          t.assigned_to = auth.uid()
          OR t.assigned_by = auth.uid()
          OR (t.company_id IS NOT NULL AND public.is_company_member(auth.uid(), t.company_id))
          OR (d.id IS NOT NULL AND (d.user_id = auth.uid()
              OR (d.company_id IS NOT NULL AND public.is_company_member(auth.uid(), d.company_id))))
        )
    )
  );
