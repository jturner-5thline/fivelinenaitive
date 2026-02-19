
-- Table to persist AI research results per deal
CREATE TABLE public.deal_research_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  research_type TEXT NOT NULL, -- 'company', 'industry', 'lender_matching', 'competitive_intel', 'market_sizing', 'rate_environment'
  content TEXT NOT NULL,
  citations JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  generated_by UUID, -- user who triggered it
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(deal_id, research_type)
);

-- Enable RLS
ALTER TABLE public.deal_research_cache ENABLE ROW LEVEL SECURITY;

-- Users can view research for deals in their company
CREATE POLICY "Users can view research for company deals"
ON public.deal_research_cache FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    JOIN public.company_members cm ON cm.company_id = d.company_id
    WHERE d.id = deal_id AND cm.user_id = auth.uid()
  )
);

-- Users can insert/update research for deals in their company
CREATE POLICY "Users can manage research for company deals"
ON public.deal_research_cache FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.deals d
    JOIN public.company_members cm ON cm.company_id = d.company_id
    WHERE d.id = deal_id AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update research for company deals"
ON public.deal_research_cache FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    JOIN public.company_members cm ON cm.company_id = d.company_id
    WHERE d.id = deal_id AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete research for company deals"
ON public.deal_research_cache FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    JOIN public.company_members cm ON cm.company_id = d.company_id
    WHERE d.id = deal_id AND cm.user_id = auth.uid()
  )
);

-- Index for fast lookups
CREATE INDEX idx_deal_research_cache_deal_type ON public.deal_research_cache(deal_id, research_type);
CREATE INDEX idx_deal_research_cache_expires ON public.deal_research_cache(expires_at);

-- Auto-update timestamp
CREATE TRIGGER update_deal_research_cache_updated_at
BEFORE UPDATE ON public.deal_research_cache
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
