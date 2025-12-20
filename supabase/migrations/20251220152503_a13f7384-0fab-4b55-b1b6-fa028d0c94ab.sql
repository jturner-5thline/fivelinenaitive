-- Create workflow_runs table to track execution history
CREATE TABLE public.workflow_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  trigger_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  results JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Enable Row Level Security
ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own workflow runs" 
ON public.workflow_runs 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own workflow runs" 
ON public.workflow_runs 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own workflow runs" 
ON public.workflow_runs 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Add index for faster lookups
CREATE INDEX idx_workflow_runs_workflow_id ON public.workflow_runs(workflow_id);
CREATE INDEX idx_workflow_runs_user_id ON public.workflow_runs(user_id);