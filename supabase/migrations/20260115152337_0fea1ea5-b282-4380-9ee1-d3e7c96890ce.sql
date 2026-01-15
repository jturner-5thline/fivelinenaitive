-- Add position column to deal_attachments for persisting order
ALTER TABLE public.deal_attachments 
ADD COLUMN position integer NOT NULL DEFAULT 0;

-- Create index for efficient ordering
CREATE INDEX idx_deal_attachments_position ON public.deal_attachments (deal_id, category, position);

-- Add RLS policy to allow users to update their deal attachments (for reordering and category changes)
CREATE POLICY "Users can update attachments for their deals" 
ON public.deal_attachments 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM deals
    WHERE (deals.id)::text = deal_attachments.deal_id 
    AND (
      deals.user_id = auth.uid() 
      OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id))
    )
  )
);