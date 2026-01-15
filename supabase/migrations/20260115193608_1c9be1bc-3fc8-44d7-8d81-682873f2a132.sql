-- Drop existing SELECT policy on flex_notifications if it exists
DROP POLICY IF EXISTS "Users can view their own flex notifications" ON public.flex_notifications;

-- Create new policy that allows viewing notifications for deals the user has access to
-- This includes: their own notifications, OR notifications for deals in their company
CREATE POLICY "Users can view flex notifications for accessible deals"
ON public.flex_notifications
FOR SELECT
USING (
  auth.uid() = user_id 
  OR 
  EXISTS (
    SELECT 1 FROM deals d
    WHERE d.id = flex_notifications.deal_id
    AND (
      d.user_id = auth.uid()
      OR (
        d.company_id IS NOT NULL 
        AND d.company_id IN (
          SELECT company_id FROM company_members WHERE user_id = auth.uid()
        )
      )
    )
  )
);