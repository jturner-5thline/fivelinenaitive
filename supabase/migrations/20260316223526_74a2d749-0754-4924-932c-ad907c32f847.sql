-- Fix 1: lender_sync_requests - restrict to platform admins only
DROP POLICY IF EXISTS "Users can view lender sync requests" ON public.lender_sync_requests;
DROP POLICY IF EXISTS "Users can update lender sync requests" ON public.lender_sync_requests;

CREATE POLICY "Admins can view lender sync requests"
ON public.lender_sync_requests
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update lender sync requests"
ON public.lender_sync_requests
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()));

-- Fix 2: wf_* tables - remove null org_company_id bypass
-- Replace ALL policies with company-member-only access (no null bypass)

-- wf_agreements
DROP POLICY IF EXISTS "wf_agreements_access" ON public.wf_agreements;
CREATE POLICY "wf_agreements_company_access" ON public.wf_agreements FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_agreements.org_company_id))
WITH CHECK (EXISTS (SELECT 1 FROM company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_agreements.org_company_id));

-- wf_contacts
DROP POLICY IF EXISTS "wf_contacts_access" ON public.wf_contacts;
CREATE POLICY "wf_contacts_company_access" ON public.wf_contacts FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_contacts.org_company_id))
WITH CHECK (EXISTS (SELECT 1 FROM company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_contacts.org_company_id));

-- wf_deals
DROP POLICY IF EXISTS "wf_deals_access" ON public.wf_deals;
CREATE POLICY "wf_deals_company_access" ON public.wf_deals FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_deals.org_company_id))
WITH CHECK (EXISTS (SELECT 1 FROM company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_deals.org_company_id));

-- wf_emails_queue
DROP POLICY IF EXISTS "wf_emails_queue_access" ON public.wf_emails_queue;
CREATE POLICY "wf_emails_queue_company_access" ON public.wf_emails_queue FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_emails_queue.org_company_id))
WITH CHECK (EXISTS (SELECT 1 FROM company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_emails_queue.org_company_id));

-- wf_invoices
DROP POLICY IF EXISTS "wf_invoices_access" ON public.wf_invoices;
CREATE POLICY "wf_invoices_company_access" ON public.wf_invoices FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_invoices.org_company_id))
WITH CHECK (EXISTS (SELECT 1 FROM company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_invoices.org_company_id));

-- wf_lenders
DROP POLICY IF EXISTS "wf_lenders_access" ON public.wf_lenders;
CREATE POLICY "wf_lenders_company_access" ON public.wf_lenders FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_lenders.org_company_id))
WITH CHECK (EXISTS (SELECT 1 FROM company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_lenders.org_company_id));

-- wf_meeting_notes
DROP POLICY IF EXISTS "wf_meeting_notes_access" ON public.wf_meeting_notes;
CREATE POLICY "wf_meeting_notes_company_access" ON public.wf_meeting_notes FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_meeting_notes.org_company_id))
WITH CHECK (EXISTS (SELECT 1 FROM company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_meeting_notes.org_company_id));

-- wf_tasks
DROP POLICY IF EXISTS "wf_tasks_access" ON public.wf_tasks;
CREATE POLICY "wf_tasks_company_access" ON public.wf_tasks FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_tasks.org_company_id))
WITH CHECK (EXISTS (SELECT 1 FROM company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_tasks.org_company_id));

-- wf_term_sheets
DROP POLICY IF EXISTS "wf_term_sheets_access" ON public.wf_term_sheets;
CREATE POLICY "wf_term_sheets_company_access" ON public.wf_term_sheets FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_term_sheets.org_company_id))
WITH CHECK (EXISTS (SELECT 1 FROM company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_term_sheets.org_company_id));

-- wf_users (uses company_id instead of org_company_id)
DROP POLICY IF EXISTS "wf_users_access" ON public.wf_users;
CREATE POLICY "wf_users_company_access" ON public.wf_users FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_users.company_id))
WITH CHECK (EXISTS (SELECT 1 FROM company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_users.company_id));

-- wf_workflow_preferences
DROP POLICY IF EXISTS "wf_workflow_preferences_access" ON public.wf_workflow_preferences;
CREATE POLICY "wf_workflow_preferences_company_access" ON public.wf_workflow_preferences FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_workflow_preferences.org_company_id))
WITH CHECK (EXISTS (SELECT 1 FROM company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_workflow_preferences.org_company_id));

-- wf_workflows
DROP POLICY IF EXISTS "wf_workflows_access" ON public.wf_workflows;
CREATE POLICY "wf_workflows_company_access" ON public.wf_workflows FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_workflows.org_company_id))
WITH CHECK (EXISTS (SELECT 1 FROM company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_workflows.org_company_id));

-- wf_workflows_log
DROP POLICY IF EXISTS "wf_workflows_log_access" ON public.wf_workflows_log;
CREATE POLICY "wf_workflows_log_company_access" ON public.wf_workflows_log FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_workflows_log.org_company_id))
WITH CHECK (EXISTS (SELECT 1 FROM company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_workflows_log.org_company_id));