-- Add notes table for deal stage changes (one note per stage history row, optional)
CREATE TABLE IF NOT EXISTS public.deal_stage_history_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_history_id UUID NOT NULL REFERENCES public.deal_stage_history(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL,
  user_id UUID NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (stage_history_id)
);

CREATE INDEX IF NOT EXISTS idx_deal_stage_history_notes_deal ON public.deal_stage_history_notes(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_stage_history_notes_history ON public.deal_stage_history_notes(stage_history_id);

ALTER TABLE public.deal_stage_history_notes ENABLE ROW LEVEL SECURITY;

-- Read access: anyone who can read the underlying deal (mirrors existing deal RLS via deal_stage_history visibility)
CREATE POLICY "Stage notes readable when stage history is readable"
ON public.deal_stage_history_notes
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.deal_stage_history h
    WHERE h.id = deal_stage_history_notes.stage_history_id
  )
);

-- Authors can insert their own notes
CREATE POLICY "Users can add their own stage notes"
ON public.deal_stage_history_notes
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.deal_stage_history h
    WHERE h.id = deal_stage_history_notes.stage_history_id
  )
);

-- Authors can update their own notes
CREATE POLICY "Users can update their own stage notes"
ON public.deal_stage_history_notes
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Authors can delete their own notes
CREATE POLICY "Users can delete their own stage notes"
ON public.deal_stage_history_notes
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_deal_stage_history_notes_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deal_stage_history_notes_updated_at ON public.deal_stage_history_notes;
CREATE TRIGGER deal_stage_history_notes_updated_at
BEFORE UPDATE ON public.deal_stage_history_notes
FOR EACH ROW EXECUTE FUNCTION public.set_deal_stage_history_notes_updated_at();