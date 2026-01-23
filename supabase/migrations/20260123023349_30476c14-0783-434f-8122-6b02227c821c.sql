-- Create table to track agent suggestion analytics
CREATE TABLE public.agent_suggestion_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  suggestion_id UUID REFERENCES public.agent_suggestions(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('viewed', 'applied', 'dismissed', 'deep_dive_opened')),
  suggestion_name TEXT NOT NULL,
  suggestion_category TEXT,
  suggestion_priority TEXT CHECK (suggestion_priority IN ('high', 'medium', 'low')),
  reasoning_length INTEGER,
  time_to_action_seconds INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agent_suggestion_analytics ENABLE ROW LEVEL SECURITY;

-- Users can insert their own analytics
CREATE POLICY "Users can insert own analytics"
  ON public.agent_suggestion_analytics
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can view their own analytics
CREATE POLICY "Users can view own analytics"
  ON public.agent_suggestion_analytics
  FOR SELECT
  USING (auth.uid() = user_id);

-- Create indexes for efficient querying
CREATE INDEX idx_suggestion_analytics_user ON public.agent_suggestion_analytics(user_id);
CREATE INDEX idx_suggestion_analytics_action ON public.agent_suggestion_analytics(action_type);
CREATE INDEX idx_suggestion_analytics_category ON public.agent_suggestion_analytics(suggestion_category);
CREATE INDEX idx_suggestion_analytics_created ON public.agent_suggestion_analytics(created_at DESC);

-- Create a view for aggregated analytics
CREATE OR REPLACE VIEW public.agent_suggestion_stats AS
SELECT 
  suggestion_category,
  suggestion_priority,
  COUNT(*) FILTER (WHERE action_type = 'viewed') as view_count,
  COUNT(*) FILTER (WHERE action_type = 'applied') as apply_count,
  COUNT(*) FILTER (WHERE action_type = 'dismissed') as dismiss_count,
  COUNT(*) FILTER (WHERE action_type = 'deep_dive_opened') as deep_dive_count,
  ROUND(
    COUNT(*) FILTER (WHERE action_type = 'applied')::numeric / 
    NULLIF(COUNT(*) FILTER (WHERE action_type IN ('applied', 'dismissed')), 0) * 100, 
    2
  ) as apply_rate_percent,
  AVG(time_to_action_seconds) FILTER (WHERE action_type IN ('applied', 'dismissed')) as avg_decision_time_seconds
FROM public.agent_suggestion_analytics
GROUP BY suggestion_category, suggestion_priority;