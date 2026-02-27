
-- Fix the overly permissive INSERT policy on notification_instances
-- Only the service role (edge function) should insert, so we scope to authenticated + system context
DROP POLICY "Service role can insert notification instances" ON public.notification_instances;

-- Edge functions use service role which bypasses RLS, so no INSERT policy needed for them.
-- Admins can also insert for manual notifications
CREATE POLICY "Admins can insert notification instances"
  ON public.notification_instances FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));
