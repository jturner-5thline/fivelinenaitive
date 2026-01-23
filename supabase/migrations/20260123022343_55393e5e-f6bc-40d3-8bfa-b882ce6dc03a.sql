-- Create agent_suggestions table to store AI-recommended agents based on behavior
CREATE TABLE public.agent_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  insight_id UUID REFERENCES public.user_behavior_insights(id) ON DELETE SET NULL,
  template_id UUID REFERENCES public.agent_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  suggested_prompt TEXT,
  suggested_triggers JSONB DEFAULT '[]'::jsonb,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  category TEXT,
  is_applied BOOLEAN NOT NULL DEFAULT false,
  applied_at TIMESTAMPTZ,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agent_suggestions ENABLE ROW LEVEL SECURITY;

-- RLS policies for agent_suggestions
CREATE POLICY "Users can view their own agent suggestions"
  ON public.agent_suggestions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own agent suggestions"
  ON public.agent_suggestions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert agent suggestions"
  ON public.agent_suggestions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can delete their own agent suggestions"
  ON public.agent_suggestions FOR DELETE
  USING (auth.uid() = user_id);

-- Add index for faster queries
CREATE INDEX idx_agent_suggestions_user ON public.agent_suggestions(user_id);
CREATE INDEX idx_agent_suggestions_active ON public.agent_suggestions(user_id, is_dismissed, is_applied);