
-- =============================================
-- Notification Framework Schema
-- =============================================

-- Channel type enum
CREATE TYPE public.notification_channel_type AS ENUM ('in_app', 'email', 'slack', 'sms', 'push');

-- Notification category enum
CREATE TYPE public.notification_category AS ENUM ('deals', 'tasks', 'lenders', 'milestones', 'reporting', 'system');

-- Notification instance status enum
CREATE TYPE public.notification_instance_status AS ENUM ('pending', 'sent', 'failed', 'skipped');

-- =============================================
-- 1. notification_rules — core configurable rules
-- =============================================
CREATE TABLE public.notification_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  trigger_key TEXT NOT NULL UNIQUE,
  category notification_category NOT NULL DEFAULT 'system',
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  channels JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- channels format: [{ "channel_type": "in_app", "is_enabled": true, "template": { "title": "...", "body": "..." } }, ...]
  default_recipients JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- default_recipients format: { "roles": ["DEAL_OWNER", "ADMIN"], "user_ids": [], "scope": "company" }
  metadata JSONB DEFAULT '{}'::jsonb,
  -- metadata for throttling, digest config, etc.
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookup by trigger_key
CREATE INDEX idx_notification_rules_trigger_key ON public.notification_rules(trigger_key);
CREATE INDEX idx_notification_rules_company_id ON public.notification_rules(company_id);

-- Enable RLS
ALTER TABLE public.notification_rules ENABLE ROW LEVEL SECURITY;

-- Admins of the company can manage rules; members can read
CREATE POLICY "Company admins can manage notification rules"
  ON public.notification_rules FOR ALL
  USING (
    public.is_admin(auth.uid())
    OR public.is_company_admin(auth.uid(), company_id)
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR public.is_company_admin(auth.uid(), company_id)
  );

CREATE POLICY "Company members can view notification rules"
  ON public.notification_rules FOR SELECT
  USING (
    public.is_company_member(auth.uid(), company_id)
  );

-- Global rules (company_id IS NULL) visible to all authenticated
CREATE POLICY "All authenticated can view global notification rules"
  ON public.notification_rules FOR SELECT
  USING (company_id IS NULL AND auth.uid() IS NOT NULL);

CREATE POLICY "Only admins can manage global notification rules"
  ON public.notification_rules FOR ALL
  USING (company_id IS NULL AND public.is_admin(auth.uid()))
  WITH CHECK (company_id IS NULL AND public.is_admin(auth.uid()));

-- =============================================
-- 2. user_notification_preferences — per-user overrides
-- =============================================
CREATE TABLE public.user_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger_key TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  channel_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- channel_overrides format: { "in_app": { "is_enabled": true }, "email": { "is_enabled": false }, ... }
  custom_recipients JSONB DEFAULT NULL,
  -- optional override for recipients
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, trigger_key)
);

CREATE INDEX idx_user_notif_prefs_user ON public.user_notification_preferences(user_id);
CREATE INDEX idx_user_notif_prefs_trigger ON public.user_notification_preferences(trigger_key);

ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own notification preferences"
  ON public.user_notification_preferences FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =============================================
-- 3. notification_instances — delivery log
-- =============================================
CREATE TABLE public.notification_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES public.notification_rules(id) ON DELETE SET NULL,
  trigger_key TEXT NOT NULL,
  recipient_user_id UUID NOT NULL,
  channel_type notification_channel_type NOT NULL,
  status notification_instance_status NOT NULL DEFAULT 'pending',
  title TEXT,
  body TEXT,
  rendered_data JSONB DEFAULT '{}'::jsonb,
  context JSONB DEFAULT '{}'::jsonb,
  -- context: the domain objects that triggered this (deal_id, task_id, etc.)
  actor_user_id UUID,
  provider_id TEXT,
  -- external provider message ID for tracking
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notif_instances_recipient ON public.notification_instances(recipient_user_id, created_at DESC);
CREATE INDEX idx_notif_instances_status ON public.notification_instances(status);
CREATE INDEX idx_notif_instances_trigger ON public.notification_instances(trigger_key);
CREATE INDEX idx_notif_instances_read ON public.notification_instances(recipient_user_id, read_at) WHERE read_at IS NULL;

ALTER TABLE public.notification_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notification instances"
  ON public.notification_instances FOR SELECT
  USING (auth.uid() = recipient_user_id);

CREATE POLICY "Users can update their own notification instances (mark read)"
  ON public.notification_instances FOR UPDATE
  USING (auth.uid() = recipient_user_id)
  WITH CHECK (auth.uid() = recipient_user_id);

-- System can insert (via service role from edge function)
CREATE POLICY "Service role can insert notification instances"
  ON public.notification_instances FOR INSERT
  WITH CHECK (true);

-- Enable realtime for in-app notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_instances;

-- =============================================
-- 4. Triggers for updated_at
-- =============================================
CREATE TRIGGER update_notification_rules_updated_at
  BEFORE UPDATE ON public.notification_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_notification_preferences_updated_at
  BEFORE UPDATE ON public.user_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
