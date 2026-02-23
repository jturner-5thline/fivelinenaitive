
-- Remove overly-permissive "Require authentication" SELECT policy on workflow_runs
-- which bypasses the proper user-scoped "Users can view their own workflow runs" policy
DROP POLICY IF EXISTS "Require authentication for workflow_runs" ON public.workflow_runs;
