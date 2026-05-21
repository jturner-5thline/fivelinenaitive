
-- Audit log for AI-triggered writes against deals
CREATE TABLE public.deal_activity (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'ai_assistant',
  action_type TEXT NOT NULL,
  before JSONB NOT NULL DEFAULT '{}'::jsonb,
  after JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_deal_activity_deal_id ON public.deal_activity(deal_id);
CREATE INDEX idx_deal_activity_created_at ON public.deal_activity(created_at DESC);

ALTER TABLE public.deal_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view deal_activity for accessible deals"
ON public.deal_activity FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.deals d
  WHERE d.id = deal_activity.deal_id
    AND (d.user_id = auth.uid() OR (d.company_id IS NOT NULL AND public.is_company_member(auth.uid(), d.company_id)))
));

CREATE POLICY "Users can insert deal_activity for accessible deals"
ON public.deal_activity FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.deals d
  WHERE d.id = deal_activity.deal_id
    AND (d.user_id = auth.uid() OR (d.company_id IS NOT NULL AND public.is_company_member(auth.uid(), d.company_id)))
));
