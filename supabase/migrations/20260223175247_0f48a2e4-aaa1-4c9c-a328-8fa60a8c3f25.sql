
-- Remove overly-permissive "Require authentication" SELECT policies
-- that bypass proper company/user-scoped policies

DROP POLICY IF EXISTS "Require authentication for lender_notes_history" ON public.lender_notes_history;
DROP POLICY IF EXISTS "Require authentication for referral_sources" ON public.referral_sources;
