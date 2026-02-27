
-- Fix overly permissive INSERT policy on zapier_webhook_logs
-- Currently allows ANY user (including unauthenticated) to insert
DROP POLICY IF EXISTS "Service role can insert webhook logs" ON public.zapier_webhook_logs;

CREATE POLICY "Service role can insert webhook logs"
ON public.zapier_webhook_logs
FOR INSERT
TO service_role
WITH CHECK (true);
