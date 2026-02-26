
-- Gamma generation comments for team collaboration
CREATE TABLE public.gamma_generation_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id UUID NOT NULL REFERENCES public.gamma_generations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  review_status TEXT DEFAULT 'comment',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.gamma_generation_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view generation comments"
  ON public.gamma_generation_comments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gamma_generations gg
      JOIN public.deals d ON d.id = gg.deal_id
      WHERE gg.id = gamma_generation_comments.generation_id
        AND public.is_same_company_as_user(auth.uid(), d.user_id)
    )
  );

CREATE POLICY "Users can create comments"
  ON public.gamma_generation_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own comments"
  ON public.gamma_generation_comments FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments"
  ON public.gamma_generation_comments FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_gamma_comments_updated_at
  BEFORE UPDATE ON public.gamma_generation_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Gamma analytics tracking
CREATE TABLE public.gamma_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES public.deals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  generation_id UUID REFERENCES public.gamma_generations(id) ON DELETE SET NULL,
  template_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.gamma_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company analytics"
  ON public.gamma_analytics FOR SELECT TO authenticated
  USING (
    deal_id IS NULL OR EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = gamma_analytics.deal_id
        AND public.is_same_company_as_user(auth.uid(), d.user_id)
    )
  );

CREATE POLICY "Users can insert analytics"
  ON public.gamma_analytics FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Add review columns to gamma_generations
ALTER TABLE public.gamma_generations
  ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0;
