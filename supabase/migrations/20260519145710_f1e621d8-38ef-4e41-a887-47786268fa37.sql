CREATE POLICY "Users can view their own allowlist entry"
ON public.page_access_allowlist
FOR SELECT
TO authenticated
USING (lower(email) = lower((auth.jwt() ->> 'email')));