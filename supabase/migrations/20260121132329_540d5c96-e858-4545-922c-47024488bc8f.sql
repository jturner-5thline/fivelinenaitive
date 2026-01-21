-- Add template_id to workflows table to track which template was used
ALTER TABLE public.workflows 
ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.workflow_templates(id) ON DELETE SET NULL;

-- Create index for faster template usage queries
CREATE INDEX IF NOT EXISTS idx_workflows_template_id ON public.workflows(template_id);

-- Add usage_count to workflow_templates for quick access
ALTER TABLE public.workflow_templates 
ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0;