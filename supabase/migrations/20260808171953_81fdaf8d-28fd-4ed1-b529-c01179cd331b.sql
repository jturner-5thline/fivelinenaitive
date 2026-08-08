DROP POLICY IF EXISTS "Users can record priority signals on accessible deals" ON public.email_priority_signal_log;
CREATE POLICY "Users can record priority signals on accessible deals"
ON public.email_priority_signal_log
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (detected_by IS NULL OR detected_by = auth.uid())
  AND (
    deal_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = email_priority_signal_log.deal_id
        AND (
          d.user_id = auth.uid()
          OR (d.company_id IS NOT NULL AND public.is_company_member(auth.uid(), d.company_id))
        )
    )
  )
);