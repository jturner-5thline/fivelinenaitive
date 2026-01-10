-- Add authentication requirement policies to prevent anonymous access
-- These policies ensure users must be logged in to access any data

-- Profiles table
CREATE POLICY "Require authentication for profiles" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Login history table
CREATE POLICY "Require authentication for login_history" 
ON public.login_history 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Company invitations table
CREATE POLICY "Require authentication for company_invitations" 
ON public.company_invitations 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Referral sources table
CREATE POLICY "Require authentication for referral_sources" 
ON public.referral_sources 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Deals table
CREATE POLICY "Require authentication for deals" 
ON public.deals 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Deal lenders table
CREATE POLICY "Require authentication for deal_lenders" 
ON public.deal_lenders 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Lender attachments table
CREATE POLICY "Require authentication for lender_attachments" 
ON public.lender_attachments 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Deal attachments table
CREATE POLICY "Require authentication for deal_attachments" 
ON public.deal_attachments 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Activity logs table
CREATE POLICY "Require authentication for activity_logs" 
ON public.activity_logs 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Deal milestones table
CREATE POLICY "Require authentication for deal_milestones" 
ON public.deal_milestones 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Outstanding items table
CREATE POLICY "Require authentication for outstanding_items" 
ON public.outstanding_items 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Deal status notes table
CREATE POLICY "Require authentication for deal_status_notes" 
ON public.deal_status_notes 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Deal flag notes table
CREATE POLICY "Require authentication for deal_flag_notes" 
ON public.deal_flag_notes 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Lender notes history table
CREATE POLICY "Require authentication for lender_notes_history" 
ON public.lender_notes_history 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Workflows table
CREATE POLICY "Require authentication for workflows" 
ON public.workflows 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Workflow runs table
CREATE POLICY "Require authentication for workflow_runs" 
ON public.workflow_runs 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Notification reads table
CREATE POLICY "Require authentication for notification_reads" 
ON public.notification_reads 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Companies table
CREATE POLICY "Require authentication for companies" 
ON public.companies 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Company members table
CREATE POLICY "Require authentication for company_members" 
ON public.company_members 
FOR SELECT 
USING (auth.uid() IS NOT NULL);