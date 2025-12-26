-- Drop the restrictive policy
DROP POLICY IF EXISTS "Authenticated users can create company" ON public.companies;

-- Create a PERMISSIVE policy for company creation
CREATE POLICY "Authenticated users can create company" 
ON public.companies 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);