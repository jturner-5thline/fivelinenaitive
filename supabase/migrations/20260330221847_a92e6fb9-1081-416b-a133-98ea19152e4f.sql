
-- Fix INSERT policy to also set company_id automatically (the trigger handles this,
-- but the WITH CHECK should be more permissive to allow company context)
DROP POLICY IF EXISTS "Users can create master lenders" ON public.master_lenders;
CREATE POLICY "Users can create master lenders"
ON public.master_lenders FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Rebuild SELECT policy using the optimized get_user_company_ids for consistency
-- The key fix: ensure company_id match is the PRIMARY path, not just a fallback
DROP POLICY IF EXISTS "Users can view their own master lenders" ON public.master_lenders;
CREATE POLICY "Company members can view master lenders"
ON public.master_lenders FOR SELECT
TO authenticated
USING (
  company_id IS NOT NULL 
  AND company_id = ANY(public.get_user_company_ids(auth.uid()))
);

-- Rebuild UPDATE policy  
DROP POLICY IF EXISTS "Users can update their own master lenders" ON public.master_lenders;
CREATE POLICY "Company members can update master lenders"
ON public.master_lenders FOR UPDATE
TO authenticated
USING (
  company_id IS NOT NULL 
  AND company_id = ANY(public.get_user_company_ids(auth.uid()))
);

-- Rebuild DELETE policy - only admins or the creator can delete
DROP POLICY IF EXISTS "Users can delete their own master lenders" ON public.master_lenders;
CREATE POLICY "Company members can delete master lenders"
ON public.master_lenders FOR DELETE
TO authenticated
USING (
  (auth.uid() = user_id)
  OR (company_id IS NOT NULL AND company_id = ANY(public.get_user_company_ids(auth.uid())) AND public.can_delete_lenders(auth.uid()))
);

-- Ensure any lender without company_id gets backfilled (safety net)
UPDATE public.master_lenders
SET company_id = (
  SELECT company_id FROM public.company_members 
  WHERE user_id = master_lenders.user_id 
  LIMIT 1
)
WHERE company_id IS NULL AND user_id IS NOT NULL;
