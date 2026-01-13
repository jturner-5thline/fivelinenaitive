-- Update the deals DELETE policy to only allow admins
DROP POLICY IF EXISTS "Users can delete deals" ON public.deals;

CREATE POLICY "Only admins can delete deals"
ON public.deals
FOR DELETE
USING (is_admin(auth.uid()));