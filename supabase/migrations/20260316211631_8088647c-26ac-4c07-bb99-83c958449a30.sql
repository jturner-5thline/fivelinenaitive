-- Create a helper function that returns the user's company IDs (cached per statement)
CREATE OR REPLACE FUNCTION public.get_user_company_ids(_user_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(array_agg(company_id), '{}')
  FROM public.company_members
  WHERE user_id = _user_id
$$;

-- Drop and recreate the SELECT policy to use array containment instead of per-row function call
DROP POLICY IF EXISTS "Users can view their own master lenders" ON public.master_lenders;
CREATE POLICY "Users can view their own master lenders"
ON public.master_lenders
FOR SELECT
TO public
USING (
  auth.uid() = user_id
  OR (
    company_id IS NOT NULL
    AND company_id = ANY(public.get_user_company_ids(auth.uid()))
  )
);

-- Also optimize UPDATE and DELETE policies the same way
DROP POLICY IF EXISTS "Users can update their own master lenders" ON public.master_lenders;
CREATE POLICY "Users can update their own master lenders"
ON public.master_lenders
FOR UPDATE
TO public
USING (
  auth.uid() = user_id
  OR (
    company_id IS NOT NULL
    AND company_id = ANY(public.get_user_company_ids(auth.uid()))
  )
);

DROP POLICY IF EXISTS "Users can delete their own master lenders" ON public.master_lenders;
CREATE POLICY "Users can delete their own master lenders"
ON public.master_lenders
FOR DELETE
TO public
USING (
  auth.uid() = user_id
  OR (
    company_id IS NOT NULL
    AND company_id = ANY(public.get_user_company_ids(auth.uid()))
  )
);