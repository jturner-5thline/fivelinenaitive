-- Create agent triggers table
CREATE TABLE public.agent_triggers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  -- Trigger type and configuration
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'deal_created',
    'deal_stage_change',
    'deal_closed',
    'lender_added',
    'lender_stage_change',
    'milestone_due',
    'milestone_completed',
    'scheduled'
  )),
  trigger_config JSONB DEFAULT '{}',
  -- Action configuration
  action_type TEXT NOT NULL DEFAULT 'generate_insight' CHECK (action_type IN (
    'generate_insight',
    'send_notification',
    'update_notes',
    'create_activity'
  )),
  action_config JSONB DEFAULT '{}',
  -- Metadata
  last_triggered_at TIMESTAMP WITH TIME ZONE,
  trigger_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create agent runs table for execution history
CREATE TABLE public.agent_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  trigger_id UUID REFERENCES public.agent_triggers(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Run context
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  lender_id UUID REFERENCES public.deal_lenders(id) ON DELETE SET NULL,
  -- Execution details
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  trigger_event TEXT,
  input_context JSONB DEFAULT '{}',
  output_content TEXT,
  error_message TEXT,
  -- Timing
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agent_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

-- RLS for triggers
CREATE POLICY "Users can view their own triggers"
  ON public.agent_triggers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own triggers"
  ON public.agent_triggers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own triggers"
  ON public.agent_triggers FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own triggers"
  ON public.agent_triggers FOR DELETE
  USING (auth.uid() = user_id);

-- RLS for runs
CREATE POLICY "Users can view their own runs"
  ON public.agent_runs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own runs"
  ON public.agent_runs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_agent_triggers_agent_id ON public.agent_triggers(agent_id);
CREATE INDEX idx_agent_triggers_user_id ON public.agent_triggers(user_id);
CREATE INDEX idx_agent_triggers_is_active ON public.agent_triggers(is_active);
CREATE INDEX idx_agent_runs_agent_id ON public.agent_runs(agent_id);
CREATE INDEX idx_agent_runs_trigger_id ON public.agent_runs(trigger_id);
CREATE INDEX idx_agent_runs_user_id ON public.agent_runs(user_id);
CREATE INDEX idx_agent_runs_status ON public.agent_runs(status);
CREATE INDEX idx_agent_runs_created_at ON public.agent_runs(created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER update_agent_triggers_updated_at
  BEFORE UPDATE ON public.agent_triggers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to check and execute agent triggers
CREATE OR REPLACE FUNCTION public.check_agent_triggers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  trigger_record RECORD;
  event_type TEXT;
  deal_record RECORD;
BEGIN
  -- Determine event type based on table and operation
  IF TG_TABLE_NAME = 'deals' THEN
    IF TG_OP = 'INSERT' THEN
      event_type := 'deal_created';
    ELSIF TG_OP = 'UPDATE' THEN
      IF OLD.stage IS DISTINCT FROM NEW.stage THEN
        event_type := 'deal_stage_change';
      ELSIF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('won', 'lost', 'closed') THEN
        event_type := 'deal_closed';
      ELSE
        RETURN COALESCE(NEW, OLD);
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'deal_lenders' THEN
    IF TG_OP = 'INSERT' THEN
      event_type := 'lender_added';
    ELSIF TG_OP = 'UPDATE' AND OLD.stage IS DISTINCT FROM NEW.stage THEN
      event_type := 'lender_stage_change';
    ELSE
      RETURN COALESCE(NEW, OLD);
    END IF;
  ELSIF TG_TABLE_NAME = 'deal_milestones' THEN
    IF TG_OP = 'UPDATE' AND OLD.completed = false AND NEW.completed = true THEN
      event_type := 'milestone_completed';
    ELSE
      RETURN COALESCE(NEW, OLD);
    END IF;
  END IF;

  -- Find matching active triggers for this user
  FOR trigger_record IN
    SELECT t.*, a.system_prompt, a.personality, a.temperature,
           a.can_access_deals, a.can_access_lenders, a.can_access_activities, a.can_access_milestones
    FROM public.agent_triggers t
    JOIN public.agents a ON a.id = t.agent_id
    WHERE t.is_active = true
      AND t.trigger_type = event_type
      AND t.user_id = COALESCE(NEW.user_id, (SELECT user_id FROM deals WHERE id = NEW.deal_id LIMIT 1))
  LOOP
    -- Create a pending run record
    INSERT INTO public.agent_runs (
      agent_id,
      trigger_id,
      user_id,
      deal_id,
      status,
      trigger_event,
      input_context
    ) VALUES (
      trigger_record.agent_id,
      trigger_record.id,
      trigger_record.user_id,
      COALESCE(NEW.deal_id, NEW.id),
      'pending',
      event_type,
      jsonb_build_object(
        'trigger_type', event_type,
        'table', TG_TABLE_NAME,
        'operation', TG_OP,
        'new_data', to_jsonb(NEW),
        'old_data', CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END
      )
    );

    -- Update trigger stats
    UPDATE public.agent_triggers
    SET last_triggered_at = now(), trigger_count = trigger_count + 1
    WHERE id = trigger_record.id;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create triggers on relevant tables
CREATE TRIGGER agent_trigger_on_deals
  AFTER INSERT OR UPDATE ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.check_agent_triggers();

CREATE TRIGGER agent_trigger_on_lenders
  AFTER INSERT OR UPDATE ON public.deal_lenders
  FOR EACH ROW
  EXECUTE FUNCTION public.check_agent_triggers();

CREATE TRIGGER agent_trigger_on_milestones
  AFTER UPDATE ON public.deal_milestones
  FOR EACH ROW
  EXECUTE FUNCTION public.check_agent_triggers();