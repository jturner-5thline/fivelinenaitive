
-- Create uploaded_items table
CREATE TABLE public.uploaded_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  upload_batch_id UUID NOT NULL,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  mapping_status TEXT NOT NULL DEFAULT 'unmapped' CHECK (mapping_status IN ('unmapped', 'mapped', 'ignored')),
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create uploaded_item_checklist_mapping join table
CREATE TABLE public.uploaded_item_checklist_mapping (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  uploaded_item_id UUID NOT NULL REFERENCES public.uploaded_items(id) ON DELETE CASCADE,
  checklist_item_id UUID NOT NULL REFERENCES public.deal_checklist_items(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(uploaded_item_id, checklist_item_id)
);

-- Indexes
CREATE INDEX idx_uploaded_items_batch ON public.uploaded_items(upload_batch_id);
CREATE INDEX idx_uploaded_items_deal ON public.uploaded_items(deal_id);
CREATE INDEX idx_uploaded_items_status ON public.uploaded_items(mapping_status);
CREATE INDEX idx_uicm_item ON public.uploaded_item_checklist_mapping(uploaded_item_id);
CREATE INDEX idx_uicm_checklist ON public.uploaded_item_checklist_mapping(checklist_item_id);

-- Enable RLS
ALTER TABLE public.uploaded_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uploaded_item_checklist_mapping ENABLE ROW LEVEL SECURITY;

-- RLS policies for uploaded_items (company-scoped via deals)
CREATE POLICY "Users can view uploaded items for their company deals"
  ON public.uploaded_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      JOIN public.company_members cm ON cm.company_id = d.company_id
      WHERE d.id = uploaded_items.deal_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert uploaded items for their company deals"
  ON public.uploaded_items FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.deals d
      JOIN public.company_members cm ON cm.company_id = d.company_id
      WHERE d.id = uploaded_items.deal_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update uploaded items for their company deals"
  ON public.uploaded_items FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      JOIN public.company_members cm ON cm.company_id = d.company_id
      WHERE d.id = uploaded_items.deal_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete uploaded items for their company deals"
  ON public.uploaded_items FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      JOIN public.company_members cm ON cm.company_id = d.company_id
      WHERE d.id = uploaded_items.deal_id AND cm.user_id = auth.uid()
    )
  );

-- RLS policies for mapping table (via uploaded_items -> deals)
CREATE POLICY "Users can view mappings for their company deals"
  ON public.uploaded_item_checklist_mapping FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.uploaded_items ui
      JOIN public.deals d ON d.id = ui.deal_id
      JOIN public.company_members cm ON cm.company_id = d.company_id
      WHERE ui.id = uploaded_item_checklist_mapping.uploaded_item_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert mappings for their company deals"
  ON public.uploaded_item_checklist_mapping FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.uploaded_items ui
      JOIN public.deals d ON d.id = ui.deal_id
      JOIN public.company_members cm ON cm.company_id = d.company_id
      WHERE ui.id = uploaded_item_checklist_mapping.uploaded_item_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete mappings for their company deals"
  ON public.uploaded_item_checklist_mapping FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.uploaded_items ui
      JOIN public.deals d ON d.id = ui.deal_id
      JOIN public.company_members cm ON cm.company_id = d.company_id
      WHERE ui.id = uploaded_item_checklist_mapping.uploaded_item_id AND cm.user_id = auth.uid()
    )
  );

-- Updated_at trigger
CREATE TRIGGER set_uploaded_items_updated_at
  BEFORE UPDATE ON public.uploaded_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
