-- Drop existing RLS policies on deal_attachments
DROP POLICY IF EXISTS "Users can delete their own attachments" ON public.deal_attachments;
DROP POLICY IF EXISTS "Users can upload their own attachments" ON public.deal_attachments;
DROP POLICY IF EXISTS "Users can view their own attachments" ON public.deal_attachments;

-- Create new policies that verify deal ownership
CREATE POLICY "Users can view attachments for their deals" 
ON public.deal_attachments 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM deals
    WHERE deals.id::text = deal_attachments.deal_id
    AND (
      deals.user_id = auth.uid() 
      OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id))
    )
  )
);

CREATE POLICY "Users can upload attachments for their deals" 
ON public.deal_attachments 
FOR INSERT 
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM deals
    WHERE deals.id::text = deal_attachments.deal_id
    AND (
      deals.user_id = auth.uid() 
      OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id))
    )
  )
);

CREATE POLICY "Users can delete attachments for their deals" 
ON public.deal_attachments 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM deals
    WHERE deals.id::text = deal_attachments.deal_id
    AND (
      deals.user_id = auth.uid() 
      OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id))
    )
  )
);