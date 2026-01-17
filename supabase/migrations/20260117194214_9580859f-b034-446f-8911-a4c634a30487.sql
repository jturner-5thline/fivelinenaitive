-- System Settings table for global configuration
CREATE TABLE public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read settings
CREATE POLICY "Anyone can read system settings"
ON public.system_settings FOR SELECT TO authenticated USING (true);

-- Only admins can modify
CREATE POLICY "Admins can manage system settings"
ON public.system_settings FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_system_settings_updated_at
BEFORE UPDATE ON public.system_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default settings
INSERT INTO public.system_settings (key, value, description, category) VALUES
  ('maintenance_mode', '{"enabled": false, "message": "System is under maintenance. Please check back soon."}', 'Enable maintenance mode to restrict access', 'system'),
  ('session_timeout', '{"minutes": 60, "warn_before_minutes": 5}', 'Session timeout settings', 'security'),
  ('require_2fa', '{"enabled": false, "roles": []}', 'Require 2FA for specific roles', 'security'),
  ('default_deal_stages', '{"stages": ["Prospecting", "Qualification", "Proposal", "Negotiation", "Closed Won", "Closed Lost"]}', 'Default deal stages for new companies', 'defaults'),
  ('default_lender_stages', '{"stages": ["Identified", "Contacted", "Reviewing", "Term Sheet", "Closed", "Passed"]}', 'Default lender stages for new companies', 'defaults');

-- System Announcements table
CREATE TABLE public.system_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'success', 'error')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  show_from TIMESTAMP WITH TIME ZONE,
  show_until TIMESTAMP WITH TIME ZONE,
  target_roles TEXT[] DEFAULT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_announcements ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read active announcements
CREATE POLICY "Anyone can read active announcements"
ON public.system_announcements FOR SELECT TO authenticated USING (true);

-- Only admins can manage
CREATE POLICY "Admins can manage announcements"
ON public.system_announcements FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_system_announcements_updated_at
BEFORE UPDATE ON public.system_announcements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Email Templates table
CREATE TABLE public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  variables TEXT[] DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read email templates"
ON public.email_templates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage email templates"
ON public.email_templates FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_email_templates_updated_at
BEFORE UPDATE ON public.email_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default email templates
INSERT INTO public.email_templates (name, subject, body_html, body_text, variables) VALUES
  ('invitation', 'You''ve been invited to join {{company_name}} on nAItive', '<h1>Welcome!</h1><p>You''ve been invited to join {{company_name}} on nAItive.</p><p><a href="{{invite_link}}">Accept Invitation</a></p>', 'You''ve been invited to join {{company_name}} on nAItive. Accept here: {{invite_link}}', ARRAY['company_name', 'invite_link', 'inviter_name']),
  ('weekly_summary', 'Your Weekly Deal Summary', '<h1>Weekly Summary</h1><p>Here''s your activity from this week:</p>{{summary_content}}', 'Weekly Summary\n\n{{summary_content}}', ARRAY['user_name', 'summary_content', 'deal_count']),
  ('deal_notification', 'Deal Update: {{deal_name}}', '<h1>Deal Update</h1><p>{{notification_message}}</p>', 'Deal Update: {{deal_name}}\n\n{{notification_message}}', ARRAY['deal_name', 'notification_message', 'user_name']);

-- IP Allowlist table
CREATE TABLE public.ip_allowlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ip_allowlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read IP allowlist"
ON public.ip_allowlist FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage IP allowlist"
ON public.ip_allowlist FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Integration Logs table (for webhook/sync monitoring)
CREATE TABLE public.integration_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_type TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'retrying')),
  payload JSONB,
  response JSONB,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.integration_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read integration logs"
ON public.integration_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert integration logs"
ON public.integration_logs FOR INSERT TO authenticated
WITH CHECK (true);

-- Error Logs table for aggregated errors
CREATE TABLE public.error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_type TEXT NOT NULL,
  error_message TEXT NOT NULL,
  stack_trace TEXT,
  user_id UUID,
  page_url TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read error logs"
ON public.error_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can insert error logs"
ON public.error_logs FOR INSERT TO authenticated
WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX idx_system_announcements_active ON public.system_announcements(is_active, show_from, show_until);
CREATE INDEX idx_integration_logs_type_status ON public.integration_logs(integration_type, status, created_at DESC);
CREATE INDEX idx_error_logs_type_created ON public.error_logs(error_type, created_at DESC);
CREATE INDEX idx_rate_limits_blocked ON public.rate_limits(blocked_until) WHERE blocked_until IS NOT NULL;