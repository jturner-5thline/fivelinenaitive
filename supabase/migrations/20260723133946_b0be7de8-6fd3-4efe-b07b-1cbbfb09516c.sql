-- Allow workspace members to view AQ audit rows for deals owned by teammates in the same company
CREATE POLICY "Company members can view AQ audit rows for their deals"
ON public.approval_queue_audit
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.ai_action_queue q
    JOIN public.company_members cm_owner
      ON cm_owner.user_id = q.user_id
    JOIN public.company_members cm_me
      ON cm_me.company_id = cm_owner.company_id
     AND cm_me.user_id = auth.uid()
    WHERE q.id = approval_queue_audit.action_queue_id
  )
);