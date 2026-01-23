-- Create table for deal-specific checklist items
CREATE TABLE public.deal_checklist_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  is_required BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.deal_checklist_items ENABLE ROW LEVEL SECURITY;

-- Create policies for deal-specific checklist items
CREATE POLICY "Users can view deal checklist items for their deals"
ON public.deal_checklist_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_id
    AND (d.user_id = auth.uid() OR d.company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    ))
  )
);

CREATE POLICY "Users can create deal checklist items for their deals"
ON public.deal_checklist_items
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_id
    AND (d.user_id = auth.uid() OR d.company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    ))
  )
);

CREATE POLICY "Users can update deal checklist items for their deals"
ON public.deal_checklist_items
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_id
    AND (d.user_id = auth.uid() OR d.company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    ))
  )
);

CREATE POLICY "Users can delete deal checklist items for their deals"
ON public.deal_checklist_items
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_id
    AND (d.user_id = auth.uid() OR d.company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    ))
  )
);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_deal_checklist_items_updated_at
BEFORE UPDATE ON public.deal_checklist_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Update deal_checklist_status to also support deal-specific items
-- Add a column to distinguish if it's a template or deal-specific item
ALTER TABLE public.deal_checklist_status 
ADD COLUMN IF NOT EXISTS deal_checklist_item_id UUID REFERENCES public.deal_checklist_items(id) ON DELETE CASCADE;

-- Make checklist_item_id nullable since we can now reference deal-specific items instead
ALTER TABLE public.deal_checklist_status 
ALTER COLUMN checklist_item_id DROP NOT NULL;

-- Add a check constraint to ensure either checklist_item_id or deal_checklist_item_id is set
ALTER TABLE public.deal_checklist_status
ADD CONSTRAINT checklist_item_reference_check 
CHECK (
  (checklist_item_id IS NOT NULL AND deal_checklist_item_id IS NULL) OR
  (checklist_item_id IS NULL AND deal_checklist_item_id IS NOT NULL)
);