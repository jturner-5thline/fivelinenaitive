CREATE POLICY "Users can update flag notes for their deals"
ON public.deal_flag_notes
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM deals d
    WHERE d.id = deal_flag_notes.deal_id
    AND (d.user_id = auth.uid() OR (d.company_id IS NOT NULL AND d.company_id = get_user_company_id(auth.uid())))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM deals d
    WHERE d.id = deal_flag_notes.deal_id
    AND (d.user_id = auth.uid() OR (d.company_id IS NOT NULL AND d.company_id = get_user_company_id(auth.uid())))
  )
);