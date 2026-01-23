-- ============================================
-- PHASE 3-6: Agent Builder Advanced Features
-- ============================================

-- Add schedule fields to agent_triggers
ALTER TABLE public.agent_triggers 
ADD COLUMN IF NOT EXISTS schedule_cron TEXT,
ADD COLUMN IF NOT EXISTS schedule_timezone TEXT DEFAULT 'UTC',
ADD COLUMN IF NOT EXISTS next_scheduled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS conditions JSONB DEFAULT '[]'::jsonb;

-- Update trigger_type check to include scheduled
ALTER TABLE public.agent_triggers 
DROP CONSTRAINT IF EXISTS agent_triggers_trigger_type_check;

ALTER TABLE public.agent_triggers
ADD CONSTRAINT agent_triggers_trigger_type_check 
CHECK (trigger_type IN (
  'deal_created', 'deal_stage_change', 'deal_closed', 
  'lender_added', 'lender_stage_change', 'milestone_completed',
  'scheduled'
));

-- Update action_type to support more actions
ALTER TABLE public.agent_triggers 
DROP CONSTRAINT IF EXISTS agent_triggers_action_type_check;

ALTER TABLE public.agent_triggers
ADD CONSTRAINT agent_triggers_action_type_check 
CHECK (action_type IN (
  'generate_insight', 'send_email', 'create_activity', 
  'update_deal', 'send_notification', 'webhook'
));

-- Add lender_id to agent_runs for lender-specific triggers
ALTER TABLE public.agent_runs
ADD COLUMN IF NOT EXISTS action_result JSONB;

-- ============================================
-- Agent Templates Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.agent_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  avatar_emoji TEXT DEFAULT '🤖',
  system_prompt TEXT NOT NULL,
  personality TEXT,
  temperature NUMERIC DEFAULT 0.7,
  can_access_deals BOOLEAN DEFAULT true,
  can_access_lenders BOOLEAN DEFAULT true,
  can_access_activities BOOLEAN DEFAULT true,
  can_access_milestones BOOLEAN DEFAULT true,
  can_search_web BOOLEAN DEFAULT false,
  suggested_triggers JSONB DEFAULT '[]'::jsonb,
  is_featured BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agent_templates ENABLE ROW LEVEL SECURITY;

-- Templates are readable by all authenticated users
CREATE POLICY "Agent templates are viewable by authenticated users"
ON public.agent_templates FOR SELECT
TO authenticated
USING (true);

-- Only admins can manage templates
CREATE POLICY "Admins can manage agent templates"
ON public.agent_templates FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()));

-- ============================================
-- Seed Default Agent Templates
-- ============================================
INSERT INTO public.agent_templates (name, description, category, avatar_emoji, system_prompt, personality, can_access_deals, can_access_lenders, can_access_activities, can_access_milestones, can_search_web, suggested_triggers, is_featured) VALUES
(
  'Deal Analyzer',
  'Analyzes deals and provides insights on deal health, risks, and opportunities',
  'analysis',
  '📊',
  'You are a deal analysis expert. When asked about a deal, analyze its current state, identify potential risks, highlight opportunities, and provide actionable recommendations. Focus on deal value, stage progression, lender engagement, and milestone completion rates.',
  'analytical',
  true, true, true, true, false,
  '[{"trigger_type": "deal_stage_change", "description": "Analyze deal when stage changes"}, {"trigger_type": "deal_created", "description": "Initial analysis for new deals"}]'::jsonb,
  true
),
(
  'Lender Matcher',
  'Suggests optimal lenders based on deal characteristics and historical patterns',
  'matching',
  '🎯',
  'You are a lender matching specialist. Analyze deal characteristics including industry, deal size, location, and type to recommend the most suitable lenders. Consider historical success rates and lender preferences when making recommendations.',
  'strategic',
  true, true, true, false, true,
  '[{"trigger_type": "deal_created", "description": "Suggest lenders for new deals"}, {"trigger_type": "lender_stage_change", "description": "Suggest alternatives when lender passes"}]'::jsonb,
  true
),
(
  'Pipeline Health Monitor',
  'Monitors pipeline health and alerts on stale deals or missed milestones',
  'monitoring',
  '🏥',
  'You are a pipeline health monitor. Regularly check deal status, identify stale deals that haven''t progressed, flag upcoming or missed milestones, and provide daily/weekly summaries of pipeline health with specific action items.',
  'proactive',
  true, true, true, true, false,
  '[{"trigger_type": "scheduled", "schedule": "0 9 * * *", "description": "Daily morning health check"}, {"trigger_type": "milestone_completed", "description": "Celebrate wins and suggest next steps"}]'::jsonb,
  true
),
(
  'Activity Summarizer',
  'Generates concise summaries of recent deal activities and communications',
  'summary',
  '📝',
  'You are an activity summarizer. Create clear, concise summaries of deal activities, communications, and changes. Highlight important updates, key decisions, and next steps. Format summaries for quick scanning.',
  'concise',
  true, true, true, true, false,
  '[{"trigger_type": "scheduled", "schedule": "0 17 * * 5", "description": "Weekly Friday summary"}]'::jsonb,
  true
),
(
  'Risk Assessor',
  'Identifies and assesses risks in deals based on multiple factors',
  'analysis',
  '⚠️',
  'You are a risk assessment specialist. Evaluate deals for potential risks including timeline risks, lender concentration, milestone delays, and market conditions. Assign risk scores and provide mitigation strategies.',
  'cautious',
  true, true, true, true, true,
  '[{"trigger_type": "deal_stage_change", "description": "Reassess risk on stage changes"}, {"trigger_type": "lender_stage_change", "description": "Evaluate lender-related risks"}]'::jsonb,
  true
),
(
  'Competitive Intel',
  'Researches market conditions and competitive landscape for deals',
  'research',
  '🔍',
  'You are a competitive intelligence researcher. Research market conditions, industry trends, and competitive landscape relevant to deals. Provide insights on market sizing, competitor activities, and strategic positioning.',
  'investigative',
  true, false, false, false, true,
  '[{"trigger_type": "deal_created", "description": "Research market for new deals"}]'::jsonb,
  false
);

-- ============================================
-- Function to calculate next scheduled run
-- ============================================
CREATE OR REPLACE FUNCTION public.calculate_next_schedule(
  cron_expression TEXT,
  timezone TEXT DEFAULT 'UTC'
) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  parts TEXT[];
  minute_part TEXT;
  hour_part TEXT;
  next_run TIMESTAMPTZ;
BEGIN
  -- Simple cron parser for common patterns
  -- Format: minute hour day month weekday
  parts := string_to_array(cron_expression, ' ');
  
  IF array_length(parts, 1) != 5 THEN
    RETURN NULL;
  END IF;
  
  minute_part := parts[1];
  hour_part := parts[2];
  
  -- For now, calculate next occurrence (simplified)
  -- Full cron parsing would require more complex logic
  next_run := date_trunc('day', now() AT TIME ZONE timezone) 
              + (COALESCE(NULLIF(hour_part, '*'), '9')::int * INTERVAL '1 hour')
              + (COALESCE(NULLIF(minute_part, '*'), '0')::int * INTERVAL '1 minute');
  
  -- If already passed today, move to tomorrow
  IF next_run <= now() THEN
    next_run := next_run + INTERVAL '1 day';
  END IF;
  
  RETURN next_run AT TIME ZONE timezone;
END;
$$;

-- ============================================
-- Update trigger to set next_scheduled_at
-- ============================================
CREATE OR REPLACE FUNCTION public.update_schedule_next_run()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.trigger_type = 'scheduled' AND NEW.schedule_cron IS NOT NULL THEN
    NEW.next_scheduled_at := public.calculate_next_schedule(NEW.schedule_cron, COALESCE(NEW.schedule_timezone, 'UTC'));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_schedule_next_run
BEFORE INSERT OR UPDATE OF schedule_cron, schedule_timezone ON public.agent_triggers
FOR EACH ROW
EXECUTE FUNCTION public.update_schedule_next_run();

-- ============================================
-- Updated at trigger for templates
-- ============================================
CREATE TRIGGER update_agent_templates_updated_at
BEFORE UPDATE ON public.agent_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();