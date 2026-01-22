-- Table for storing data room checklist template items
CREATE TABLE public.data_room_checklist_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  is_required BOOLEAN NOT NULL DEFAULT true,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table for tracking checklist status per deal
CREATE TABLE public.deal_checklist_status (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  checklist_item_id UUID NOT NULL REFERENCES public.data_room_checklist_items(id) ON DELETE CASCADE,
  is_complete BOOLEAN NOT NULL DEFAULT false,
  attachment_id UUID REFERENCES public.deal_attachments(id) ON DELETE SET NULL,
  notes TEXT,
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(deal_id, checklist_item_id)
);

-- Enable RLS
ALTER TABLE public.data_room_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_checklist_status ENABLE ROW LEVEL SECURITY;

-- RLS policies for checklist items (template)
CREATE POLICY "Users can view their own checklist items"
ON public.data_room_checklist_items FOR SELECT
USING (auth.uid() = user_id OR public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Users can create their own checklist items"
ON public.data_room_checklist_items FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own checklist items"
ON public.data_room_checklist_items FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own checklist items"
ON public.data_room_checklist_items FOR DELETE
USING (auth.uid() = user_id);

-- RLS policies for deal checklist status
CREATE POLICY "Users can view deal checklist status for accessible deals"
ON public.deal_checklist_status FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.deals d 
    WHERE d.id = deal_id 
    AND (d.user_id = auth.uid() OR public.is_same_company_as_user(auth.uid(), d.user_id))
  )
);

CREATE POLICY "Users can manage deal checklist status for their deals"
ON public.deal_checklist_status FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.deals d 
    WHERE d.id = deal_id 
    AND (d.user_id = auth.uid() OR public.is_same_company_as_user(auth.uid(), d.user_id))
  )
);

CREATE POLICY "Users can update deal checklist status for their deals"
ON public.deal_checklist_status FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.deals d 
    WHERE d.id = deal_id 
    AND (d.user_id = auth.uid() OR public.is_same_company_as_user(auth.uid(), d.user_id))
  )
);

CREATE POLICY "Users can delete deal checklist status for their deals"
ON public.deal_checklist_status FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.deals d 
    WHERE d.id = deal_id 
    AND (d.user_id = auth.uid() OR public.is_same_company_as_user(auth.uid(), d.user_id))
  )
);

-- Indexes for performance
CREATE INDEX idx_data_room_checklist_items_user ON public.data_room_checklist_items(user_id);
CREATE INDEX idx_data_room_checklist_items_company ON public.data_room_checklist_items(company_id);
CREATE INDEX idx_deal_checklist_status_deal ON public.deal_checklist_status(deal_id);
CREATE INDEX idx_deal_checklist_status_item ON public.deal_checklist_status(checklist_item_id);

-- Trigger for updated_at
CREATE TRIGGER update_data_room_checklist_items_updated_at
BEFORE UPDATE ON public.data_room_checklist_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_deal_checklist_status_updated_at
BEFORE UPDATE ON public.deal_checklist_status
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();