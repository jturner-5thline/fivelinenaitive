
ALTER TABLE public.error_logs
  ADD COLUMN IF NOT EXISTS feature text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by uuid;

CREATE INDEX IF NOT EXISTS idx_error_logs_status_created ON public.error_logs(status, created_at DESC);

DROP POLICY IF EXISTS "Admins can update error logs" ON public.error_logs;
CREATE POLICY "Admins can update error logs"
  ON public.error_logs FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.system_settings (key, value, category, description) VALUES
  ('platform_name', '{"value": "naitive"}'::jsonb, 'platform', 'Platform display name'),
  ('support_email', '{"value": ""}'::jsonb, 'platform', 'Support contact email'),
  ('default_timezone', '{"value": "America/New_York"}'::jsonb, 'platform', 'Default timezone'),
  ('default_language', '{"value": "en"}'::jsonb, 'platform', 'Default language')
ON CONFLICT (key) DO NOTHING;
