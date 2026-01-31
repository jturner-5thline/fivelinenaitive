-- Drop existing restrictive policies on outstanding_items
DROP POLICY IF EXISTS "Require authentication for outstanding_items" ON public.outstanding_items;
DROP POLICY IF EXISTS "Users can create their own outstanding_items" ON public.outstanding_items;
DROP POLICY IF EXISTS "Users can delete their own outstanding_items" ON public.outstanding_items;
DROP POLICY IF EXISTS "Users can update their own outstanding_items" ON public.outstanding_items;
DROP POLICY IF EXISTS "Users can view their own outstanding_items" ON public.outstanding_items;

-- Create better policies that allow company members to manage outstanding items for deals they can access
-- Select: Users can view outstanding items for deals they own or are in the same company
CREATE POLICY "Users can view outstanding items for accessible deals"
ON public.outstanding_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = outstanding_items.deal_id
    AND (
      d.user_id = auth.uid()
      OR public.is_same_company_as_user(auth.uid(), d.user_id)
    )
  )
);

-- Insert: Users can create outstanding items for deals they own or are in the same company
CREATE POLICY "Users can create outstanding items for accessible deals"
ON public.outstanding_items
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = outstanding_items.deal_id
    AND (
      d.user_id = auth.uid()
      OR public.is_same_company_as_user(auth.uid(), d.user_id)
    )
  )
);

-- Update: Users can update outstanding items for deals they can access
CREATE POLICY "Users can update outstanding items for accessible deals"
ON public.outstanding_items
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = outstanding_items.deal_id
    AND (
      d.user_id = auth.uid()
      OR public.is_same_company_as_user(auth.uid(), d.user_id)
    )
  )
);

-- Delete: Users can delete outstanding items for deals they can access
CREATE POLICY "Users can delete outstanding items for accessible deals"
ON public.outstanding_items
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = outstanding_items.deal_id
    AND (
      d.user_id = auth.uid()
      OR public.is_same_company_as_user(auth.uid(), d.user_id)
    )
  )
);