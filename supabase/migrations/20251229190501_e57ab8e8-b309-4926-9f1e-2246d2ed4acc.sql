-- Persist deal milestones
CREATE TABLE IF NOT EXISTS public.deal_milestones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  user_id UUID NULL,
  title TEXT NOT NULL,
  due_date TIMESTAMP WITH TIME ZONE NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMP WITH TIME ZONE NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.deal_milestones ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_deal_milestones_deal_id ON public.deal_milestones (deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_milestones_created_at ON public.deal_milestones (created_at);

-- RLS policies (match deal ownership)
DO $$ BEGIN
  CREATE POLICY "Users can view milestones for their deals"
  ON public.deal_milestones
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.deals
      WHERE deals.id = deal_milestones.deal_id
        AND deals.user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can create milestones for their deals"
  ON public.deal_milestones
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.deals
      WHERE deals.id = deal_milestones.deal_id
        AND deals.user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update milestones for their deals"
  ON public.deal_milestones
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.deals
      WHERE deals.id = deal_milestones.deal_id
        AND deals.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.deals
      WHERE deals.id = deal_milestones.deal_id
        AND deals.user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete milestones for their deals"
  ON public.deal_milestones
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.deals
      WHERE deals.id = deal_milestones.deal_id
        AND deals.user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- updated_at automation
DROP TRIGGER IF EXISTS update_deal_milestones_updated_at ON public.deal_milestones;
CREATE TRIGGER update_deal_milestones_updated_at
BEFORE UPDATE ON public.deal_milestones
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();