
-- Deal aliases table for matching Claap recordings via shorthand/abbreviated names
CREATE TABLE public.deal_aliases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  alias_normalized TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast lookup during matching
CREATE INDEX idx_deal_aliases_normalized ON public.deal_aliases (alias_normalized);
CREATE INDEX idx_deal_aliases_deal_id ON public.deal_aliases (deal_id);

-- Unique constraint to prevent duplicate aliases per deal
ALTER TABLE public.deal_aliases ADD CONSTRAINT deal_aliases_deal_alias_unique UNIQUE (deal_id, alias_normalized);

-- Enable RLS
ALTER TABLE public.deal_aliases ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view aliases for deals in their company
CREATE POLICY "Users can view deal aliases in their company"
  ON public.deal_aliases FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      JOIN public.company_members cm ON cm.company_id = d.company_id
      WHERE d.id = deal_aliases.deal_id AND cm.user_id = auth.uid()
    )
  );

-- RLS: Users can insert aliases for deals in their company
CREATE POLICY "Users can insert deal aliases in their company"
  ON public.deal_aliases FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.deals d
      JOIN public.company_members cm ON cm.company_id = d.company_id
      WHERE d.id = deal_aliases.deal_id AND cm.user_id = auth.uid()
    )
  );

-- RLS: Users can delete aliases for deals in their company
CREATE POLICY "Users can delete deal aliases in their company"
  ON public.deal_aliases FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      JOIN public.company_members cm ON cm.company_id = d.company_id
      WHERE d.id = deal_aliases.deal_id AND cm.user_id = auth.uid()
    )
  );
