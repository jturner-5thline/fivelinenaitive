
-- Fix overly permissive RLS policies on deal_info_requests
-- Drop existing permissive policies
DROP POLICY IF EXISTS "Users can view info requests" ON public.deal_info_requests;
DROP POLICY IF EXISTS "Users can update info requests" ON public.deal_info_requests;

-- Create company-scoped SELECT policy
-- Users can only see info requests for deals belonging to their company
CREATE POLICY "Users can view their company info requests"
ON public.deal_info_requests FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    JOIN public.company_members cm ON cm.company_id = d.company_id
    WHERE cm.user_id = auth.uid()
    AND d.id::text = deal_info_requests.external_deal_id
  )
);

-- Create company-scoped UPDATE policy
CREATE POLICY "Users can update their company info requests"
ON public.deal_info_requests FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    JOIN public.company_members cm ON cm.company_id = d.company_id
    WHERE cm.user_id = auth.uid()
    AND d.id::text = deal_info_requests.external_deal_id
  )
);
