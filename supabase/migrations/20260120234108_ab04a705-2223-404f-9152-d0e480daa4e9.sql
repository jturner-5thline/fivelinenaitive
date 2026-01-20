-- Create workflow_versions table for version history and rollback
CREATE TABLE public.workflow_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB NOT NULL DEFAULT '{}',
  actions JSONB NOT NULL DEFAULT '[]',
  change_summary TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for quick version lookups
CREATE INDEX idx_workflow_versions_workflow_id ON public.workflow_versions(workflow_id);
CREATE INDEX idx_workflow_versions_created_at ON public.workflow_versions(created_at DESC);

-- Add unique constraint for workflow + version number
CREATE UNIQUE INDEX idx_workflow_versions_unique ON public.workflow_versions(workflow_id, version_number);

-- Enable RLS
ALTER TABLE public.workflow_versions ENABLE ROW LEVEL SECURITY;

-- RLS policies - users can only see versions for their own workflows
CREATE POLICY "Users can view their own workflow versions"
  ON public.workflow_versions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workflows w
      WHERE w.id = workflow_versions.workflow_id
      AND w.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create versions for their own workflows"
  ON public.workflow_versions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workflows w
      WHERE w.id = workflow_versions.workflow_id
      AND w.user_id = auth.uid()
    )
  );

-- Add scheduled_actions table for delayed action execution
CREATE TABLE public.scheduled_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_run_id UUID REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_config JSONB NOT NULL DEFAULT '{}',
  trigger_data JSONB NOT NULL DEFAULT '{}',
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  executed_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for scheduled actions
CREATE INDEX idx_scheduled_actions_scheduled_for ON public.scheduled_actions(scheduled_for) WHERE status = 'pending';
CREATE INDEX idx_scheduled_actions_user_id ON public.scheduled_actions(user_id);
CREATE INDEX idx_scheduled_actions_workflow_id ON public.scheduled_actions(workflow_id);

-- Enable RLS
ALTER TABLE public.scheduled_actions ENABLE ROW LEVEL SECURITY;

-- RLS policies for scheduled_actions
CREATE POLICY "Users can view their own scheduled actions"
  ON public.scheduled_actions
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create their own scheduled actions"
  ON public.scheduled_actions
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own scheduled actions"
  ON public.scheduled_actions
  FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own scheduled actions"
  ON public.scheduled_actions
  FOR DELETE
  USING (user_id = auth.uid());