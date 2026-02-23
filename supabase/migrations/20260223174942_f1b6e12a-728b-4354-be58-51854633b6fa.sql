
-- Remove overly-permissive "Require authentication" SELECT policies
-- on deal-related tables that already have proper company-scoped SELECT policies.
-- Having both causes PostgreSQL to OR them, bypassing company isolation.

DROP POLICY IF EXISTS "Require authentication for deal_attachments" ON public.deal_attachments;
DROP POLICY IF EXISTS "Require authentication for deal_flag_notes" ON public.deal_flag_notes;
DROP POLICY IF EXISTS "Require authentication for deal_status_notes" ON public.deal_status_notes;
DROP POLICY IF EXISTS "Require authentication for deal_writeups" ON public.deal_writeups;
