
-- Custom Gamma templates created by users
CREATE TABLE public.gamma_custom_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  prompt TEXT NOT NULL,
  suggested_format TEXT NOT NULL DEFAULT 'presentation',
  icon TEXT DEFAULT 'FileText',
  is_shared BOOLEAN NOT NULL DEFAULT false,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.gamma_custom_templates ENABLE ROW LEVEL SECURITY;

-- Users see own templates + shared templates in their company
CREATE POLICY "Users can view own and shared company templates"
ON public.gamma_custom_templates FOR SELECT
USING (
  auth.uid() = user_id
  OR (
    is_shared = true
    AND company_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = gamma_custom_templates.company_id
        AND cm.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can create their own templates"
ON public.gamma_custom_templates FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own templates"
ON public.gamma_custom_templates FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own templates"
ON public.gamma_custom_templates FOR DELETE
USING (auth.uid() = user_id);

CREATE TRIGGER update_gamma_custom_templates_updated_at
BEFORE UPDATE ON public.gamma_custom_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add starred and share columns to gamma_generations
ALTER TABLE public.gamma_generations
  ADD COLUMN is_starred BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN share_token TEXT UNIQUE,
  ADD COLUMN share_expires_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX idx_gamma_generations_share_token ON public.gamma_generations(share_token) WHERE share_token IS NOT NULL;
CREATE INDEX idx_gamma_custom_templates_user ON public.gamma_custom_templates(user_id);
