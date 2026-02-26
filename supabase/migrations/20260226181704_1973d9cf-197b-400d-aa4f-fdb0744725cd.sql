
-- Table to persist Gamma generation history
CREATE TABLE public.gamma_generations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  generation_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  format TEXT NOT NULL DEFAULT 'presentation',
  template_id TEXT,
  prompt_text TEXT,
  theme_id TEXT,
  gamma_url TEXT,
  pdf_url TEXT,
  pptx_url TEXT,
  title TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.gamma_generations ENABLE ROW LEVEL SECURITY;

-- Users can view generations for deals they can access (same company)
CREATE POLICY "Users can view gamma generations for accessible deals"
ON public.gamma_generations FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    JOIN public.company_members cm ON cm.company_id = d.company_id
    WHERE d.id = gamma_generations.deal_id
      AND cm.user_id = auth.uid()
  )
);

-- Users can insert their own generations
CREATE POLICY "Users can create their own gamma generations"
ON public.gamma_generations FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own generations
CREATE POLICY "Users can update their own gamma generations"
ON public.gamma_generations FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own generations
CREATE POLICY "Users can delete their own gamma generations"
ON public.gamma_generations FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_gamma_generations_updated_at
BEFORE UPDATE ON public.gamma_generations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for fast lookups
CREATE INDEX idx_gamma_generations_deal_id ON public.gamma_generations(deal_id);
CREATE INDEX idx_gamma_generations_user_id ON public.gamma_generations(user_id);
