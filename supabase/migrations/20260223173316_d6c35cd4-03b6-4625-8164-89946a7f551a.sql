
-- Fix master_lenders: Remove overly permissive SELECT policy that lets any authenticated user see all lenders
DROP POLICY IF EXISTS "Require authentication for master_lenders" ON public.master_lenders;

-- Fix lender_attachments: Make company-scoped instead of just user-scoped
-- First, add company_id column
ALTER TABLE public.lender_attachments ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- Backfill company_id from user's company membership
UPDATE public.lender_attachments la
SET company_id = (
  SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = la.user_id LIMIT 1
)
WHERE la.company_id IS NULL;

-- Drop old user-only policies on lender_attachments
DROP POLICY IF EXISTS "Require authentication for lender_attachments" ON public.lender_attachments;
DROP POLICY IF EXISTS "Users can view their own lender attachments" ON public.lender_attachments;
DROP POLICY IF EXISTS "Users can delete their own lender attachments" ON public.lender_attachments;
DROP POLICY IF EXISTS "Users can upload their own lender attachments" ON public.lender_attachments;

-- Create company-scoped policies for lender_attachments
CREATE POLICY "Company members can view lender attachments"
ON public.lender_attachments FOR SELECT
USING (
  company_id IS NOT NULL AND is_company_member(auth.uid(), company_id)
);

CREATE POLICY "Company members can insert lender attachments"
ON public.lender_attachments FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND company_id IS NOT NULL
  AND is_company_member(auth.uid(), company_id)
);

CREATE POLICY "Company members can delete lender attachments"
ON public.lender_attachments FOR DELETE
USING (
  auth.uid() = user_id
  AND company_id IS NOT NULL
  AND is_company_member(auth.uid(), company_id)
);

-- Also fix the overly permissive DELETE policy on master_lenders that uses can_delete_lenders (5thLine-specific)
-- Keep the company-scoped one instead
DROP POLICY IF EXISTS "Only authorized users can delete lenders" ON public.master_lenders;
