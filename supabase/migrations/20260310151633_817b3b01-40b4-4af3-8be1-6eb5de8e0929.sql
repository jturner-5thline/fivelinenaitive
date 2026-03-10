
-- Annotations/comments for SaaS model cells and charts
CREATE TABLE public.model_annotations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('cell', 'chart', 'section', 'kpi')),
  target_ref TEXT NOT NULL, -- e.g. "is:recurring:5" or "chart:revenue" or "kpi:arr"
  content TEXT NOT NULL,
  mentions UUID[] DEFAULT '{}',
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_model_annotations_deal ON public.model_annotations(deal_id);
CREATE INDEX idx_model_annotations_target ON public.model_annotations(deal_id, target_type, target_ref);

-- Enable RLS
ALTER TABLE public.model_annotations ENABLE ROW LEVEL SECURITY;

-- RLS: Users in same company can read/write
CREATE POLICY "Users can view annotations for deals they can access"
  ON public.model_annotations FOR SELECT TO authenticated
  USING (public.can_access_deal(auth.uid(), deal_id));

CREATE POLICY "Users can create annotations for deals they can access"
  ON public.model_annotations FOR INSERT TO authenticated
  WITH CHECK (public.can_access_deal(auth.uid(), deal_id) AND auth.uid() = user_id);

CREATE POLICY "Users can update own annotations"
  ON public.model_annotations FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own annotations"
  ON public.model_annotations FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER set_model_annotations_updated_at
  BEFORE UPDATE ON public.model_annotations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.model_annotations;
