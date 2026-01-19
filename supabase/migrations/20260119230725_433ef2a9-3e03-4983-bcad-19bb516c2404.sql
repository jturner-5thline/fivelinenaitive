-- Fix waitlist SELECT policy: change from auth.uid() IS NOT NULL to is_admin check
DROP POLICY IF EXISTS "Only admins can view waitlist" ON public.waitlist;

CREATE POLICY "Only admins can view waitlist" 
ON public.waitlist 
FOR SELECT 
TO authenticated
USING (is_admin(auth.uid()));