-- Create a function to check if user can delete lenders
CREATE OR REPLACE FUNCTION public.can_delete_lenders(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = _user_id
      AND email IN ('jturner@5thline.co', 'ffustinoni@5thline.co')
  )
$$;

-- Drop the existing delete policy
DROP POLICY IF EXISTS "Users can delete lenders they own or in their company" ON public.master_lenders;

-- Create new restrictive delete policy
CREATE POLICY "Only authorized users can delete lenders"
ON public.master_lenders
FOR DELETE
TO authenticated
USING (public.can_delete_lenders(auth.uid()));