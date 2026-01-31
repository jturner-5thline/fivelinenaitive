-- Fix 1: Remove permissive INSERT/UPDATE policies on behavior analytics tables
-- These tables should only be written to by edge functions using service role key
-- which bypasses RLS entirely, so these policies are unnecessary and dangerous

DROP POLICY IF EXISTS "System can insert insights" ON public.user_behavior_insights;
DROP POLICY IF EXISTS "System can insert suggestions" ON public.workflow_suggestions;
DROP POLICY IF EXISTS "System can insert team metrics" ON public.team_interaction_metrics;
DROP POLICY IF EXISTS "System can update team metrics" ON public.team_interaction_metrics;

-- Fix 2: Remove the policy that exposes sensitive PII (email, phone, backup_email) to company members
-- Application code should use profiles_public view for teammate information
-- Users can still read their own profile via the existing "Users can view own profile" policy

DROP POLICY IF EXISTS "Company members can view team profiles" ON public.profiles;