-- Create table for storing historical insights
CREATE TABLE public.insights_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  pipeline_health_score INTEGER NOT NULL,
  pipeline_health_summary TEXT,
  total_value NUMERIC,
  active_deals INTEGER,
  avg_deal_size NUMERIC,
  risk_alerts JSONB DEFAULT '[]'::jsonb,
  opportunities JSONB DEFAULT '[]'::jsonb,
  recommendations JSONB DEFAULT '[]'::jsonb,
  trends JSONB DEFAULT '[]'::jsonb,
  deals_snapshot JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.insights_history ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own insights" 
ON public.insights_history 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own insights" 
ON public.insights_history 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own insights" 
ON public.insights_history 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_insights_history_user_id ON public.insights_history(user_id);
CREATE INDEX idx_insights_history_created_at ON public.insights_history(created_at DESC);