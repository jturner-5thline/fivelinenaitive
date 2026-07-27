DROP POLICY IF EXISTS "Stage notes readable when stage history is readable" ON public.deal_stage_history_notes;

CREATE POLICY "Stage notes readable when deal is accessible"
ON public.deal_stage_history_notes
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.deal_stage_history h
    WHERE h.id = deal_stage_history_notes.stage_history_id
      AND public.can_access_deal(auth.uid(), h.deal_id)
  )
);