
-- Remove overly-permissive "Require authentication" SELECT policies 
-- that bypass company-scoped policies (PostgreSQL ORs multiple policies)

-- activity_logs: the company-scoped policy already handles auth
DROP POLICY IF EXISTS "Require authentication for activity_logs" ON public.activity_logs;

-- deal_lenders: the company-scoped policy already handles auth
DROP POLICY IF EXISTS "Require authentication for deal_lenders" ON public.deal_lenders;

-- deal_milestones: the company-scoped policy already handles auth
DROP POLICY IF EXISTS "Require authentication for deal_milestones" ON public.deal_milestones;
