-- Create table to store user behavior insights
CREATE TABLE public.user_behavior_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL, -- 'bottleneck', 'pattern', 'opportunity', 'efficiency'
  category TEXT NOT NULL, -- 'deal_activity', 'time_patterns', 'team_collaboration', 'feature_adoption'
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info', -- 'info', 'warning', 'critical'
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  suggested_workflow_id UUID REFERENCES public.workflows(id) ON DELETE SET NULL,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  dismissed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Create table for personalized workflow suggestions
CREATE TABLE public.workflow_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  insight_id UUID REFERENCES public.user_behavior_insights(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  priority TEXT NOT NULL DEFAULT 'medium', -- 'high', 'medium', 'low'
  is_applied BOOLEAN NOT NULL DEFAULT false,
  applied_at TIMESTAMP WITH TIME ZONE,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  dismissed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for team interaction metrics
CREATE TABLE public.team_interaction_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
  metric_type TEXT NOT NULL, -- 'avg_response_time', 'collaboration_score', 'handoff_efficiency', 'stage_duration'
  metric_value NUMERIC NOT NULL,
  breakdown JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id, metric_date, metric_type)
);

-- Enable RLS
ALTER TABLE public.user_behavior_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_interaction_metrics ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_behavior_insights
CREATE POLICY "Users can view their own insights"
  ON public.user_behavior_insights FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view company insights"
  ON public.user_behavior_insights FOR SELECT
  USING (
    company_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = user_behavior_insights.company_id
      AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can dismiss their own insights"
  ON public.user_behavior_insights FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert insights"
  ON public.user_behavior_insights FOR INSERT
  WITH CHECK (true);

-- RLS policies for workflow_suggestions
CREATE POLICY "Users can view their own suggestions"
  ON public.workflow_suggestions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own suggestions"
  ON public.workflow_suggestions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert suggestions"
  ON public.workflow_suggestions FOR INSERT
  WITH CHECK (true);

-- RLS policies for team_interaction_metrics
CREATE POLICY "Company members can view team metrics"
  ON public.team_interaction_metrics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = team_interaction_metrics.company_id
      AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert team metrics"
  ON public.team_interaction_metrics FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update team metrics"
  ON public.team_interaction_metrics FOR UPDATE
  USING (true);

-- Create indexes
CREATE INDEX idx_user_behavior_insights_user ON public.user_behavior_insights(user_id);
CREATE INDEX idx_user_behavior_insights_company ON public.user_behavior_insights(company_id);
CREATE INDEX idx_user_behavior_insights_type ON public.user_behavior_insights(insight_type);
CREATE INDEX idx_user_behavior_insights_active ON public.user_behavior_insights(user_id) WHERE is_dismissed = false;

CREATE INDEX idx_workflow_suggestions_user ON public.workflow_suggestions(user_id);
CREATE INDEX idx_workflow_suggestions_active ON public.workflow_suggestions(user_id) WHERE is_dismissed = false AND is_applied = false;

CREATE INDEX idx_team_interaction_metrics_company ON public.team_interaction_metrics(company_id);
CREATE INDEX idx_team_interaction_metrics_date ON public.team_interaction_metrics(company_id, metric_date DESC);