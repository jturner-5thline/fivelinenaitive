
-- Drop existing policies on login_history table
DROP POLICY IF EXISTS "Users can view their own login history" ON public.login_history;
DROP POLICY IF EXISTS "Users can insert their own login history" ON public.login_history;

-- Recreate policies with explicit authenticated role requirement
CREATE POLICY "Users can view their own login history" 
ON public.login_history 
FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own login history" 
ON public.login_history 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);
