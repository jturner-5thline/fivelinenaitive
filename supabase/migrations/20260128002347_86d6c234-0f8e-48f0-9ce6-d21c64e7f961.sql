-- Create table to track when users last viewed a deal memo
CREATE TABLE public.deal_memo_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  viewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(deal_id, user_id)
);

-- Enable RLS
ALTER TABLE public.deal_memo_views ENABLE ROW LEVEL SECURITY;

-- Users can view their own memo view records
CREATE POLICY "Users can view own memo views"
  ON public.deal_memo_views
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own memo view records
CREATE POLICY "Users can insert own memo views"
  ON public.deal_memo_views
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own memo view records
CREATE POLICY "Users can update own memo views"
  ON public.deal_memo_views
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_deal_memo_views_deal_user ON public.deal_memo_views(deal_id, user_id);