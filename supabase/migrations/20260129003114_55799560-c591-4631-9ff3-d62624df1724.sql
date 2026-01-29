-- Drop existing restrictive policies on lender_contacts
DROP POLICY IF EXISTS "Users can create contacts for their lenders" ON public.lender_contacts;
DROP POLICY IF EXISTS "Users can delete contacts for their lenders" ON public.lender_contacts;
DROP POLICY IF EXISTS "Users can update contacts for their lenders" ON public.lender_contacts;
DROP POLICY IF EXISTS "Users can view lender contacts for their lenders" ON public.lender_contacts;

-- Create new policies that allow company members to manage lender contacts
-- SELECT: Users can view contacts if they own the lender OR are in the same company
CREATE POLICY "Users can view lender contacts"
ON public.lender_contacts
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM master_lenders ml
    WHERE ml.id = lender_contacts.lender_id
    AND (
      ml.user_id = auth.uid()
      OR (ml.company_id IS NOT NULL AND is_company_member(auth.uid(), ml.company_id))
    )
  )
);

-- INSERT: Users can create contacts if they own the lender OR are in the same company
CREATE POLICY "Users can create lender contacts"
ON public.lender_contacts
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM master_lenders ml
    WHERE ml.id = lender_contacts.lender_id
    AND (
      ml.user_id = auth.uid()
      OR (ml.company_id IS NOT NULL AND is_company_member(auth.uid(), ml.company_id))
    )
  )
);

-- UPDATE: Users can update contacts if they own the lender OR are in the same company
CREATE POLICY "Users can update lender contacts"
ON public.lender_contacts
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM master_lenders ml
    WHERE ml.id = lender_contacts.lender_id
    AND (
      ml.user_id = auth.uid()
      OR (ml.company_id IS NOT NULL AND is_company_member(auth.uid(), ml.company_id))
    )
  )
);

-- DELETE: Users can delete contacts if they own the lender OR are in the same company
CREATE POLICY "Users can delete lender contacts"
ON public.lender_contacts
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM master_lenders ml
    WHERE ml.id = lender_contacts.lender_id
    AND (
      ml.user_id = auth.uid()
      OR (ml.company_id IS NOT NULL AND is_company_member(auth.uid(), ml.company_id))
    )
  )
);