
-- Remove all remaining overly-permissive "Require authentication" SELECT policies
-- that bypass proper scoped policies via PostgreSQL OR semantics

DROP POLICY IF EXISTS "Require authentication for companies" ON public.companies;
DROP POLICY IF EXISTS "Require authentication for company_invitations" ON public.company_invitations;
DROP POLICY IF EXISTS "Require authentication for company_members" ON public.company_members;
DROP POLICY IF EXISTS "Require authentication for login_history" ON public.login_history;
DROP POLICY IF EXISTS "Require authentication for notification_reads" ON public.notification_reads;
