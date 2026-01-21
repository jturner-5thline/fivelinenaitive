-- Add RLS policy to allow company members to view each other's profiles
CREATE POLICY "Company members can view team profiles"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM company_members cm1
    WHERE cm1.user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM company_members cm2
      WHERE cm2.user_id = profiles.user_id
      AND cm2.company_id = cm1.company_id
    )
  )
);