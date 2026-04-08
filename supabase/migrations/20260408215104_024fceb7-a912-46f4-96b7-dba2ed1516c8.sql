
CREATE TABLE public.naitive_stage_milestones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  milestone_key TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deal_id, stage, milestone_key)
);

CREATE INDEX idx_naitive_stage_milestones_deal ON public.naitive_stage_milestones(deal_id);
CREATE INDEX idx_naitive_stage_milestones_deal_stage ON public.naitive_stage_milestones(deal_id, stage);

ALTER TABLE public.naitive_stage_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view naitive milestones"
ON public.naitive_stage_milestones
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    JOIN public.company_members cm ON cm.company_id = d.company_id
    WHERE d.id = naitive_stage_milestones.deal_id
      AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Company members can insert naitive milestones"
ON public.naitive_stage_milestones
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.deals d
    JOIN public.company_members cm ON cm.company_id = d.company_id
    WHERE d.id = naitive_stage_milestones.deal_id
      AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Company members can update naitive milestones"
ON public.naitive_stage_milestones
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    JOIN public.company_members cm ON cm.company_id = d.company_id
    WHERE d.id = naitive_stage_milestones.deal_id
      AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Company members can delete naitive milestones"
ON public.naitive_stage_milestones
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    JOIN public.company_members cm ON cm.company_id = d.company_id
    WHERE d.id = naitive_stage_milestones.deal_id
      AND cm.user_id = auth.uid()
  )
);

CREATE TRIGGER update_naitive_stage_milestones_updated_at
BEFORE UPDATE ON public.naitive_stage_milestones
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
