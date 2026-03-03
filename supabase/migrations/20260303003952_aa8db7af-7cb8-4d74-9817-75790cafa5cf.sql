
-- ============================================
-- Claap Meetings Integration Schema (Phase 1+2)
-- ============================================

-- Enum for meeting routing status
CREATE TYPE public.claap_meeting_status AS ENUM (
  'pending_review',
  'routed',
  'excluded',
  'awaiting_confirmation'
);

-- Enum for routing task type
CREATE TYPE public.claap_task_type AS ENUM (
  'confirm_contact',
  'confirm_company',
  'create_deal',
  'disambiguate_deal'
);

-- Enum for routing task status
CREATE TYPE public.claap_task_status AS ENUM (
  'pending',
  'completed',
  'expired',
  'dismissed'
);

-- ============================================
-- 1. claap_meetings - Core meeting records
-- ============================================
CREATE TABLE public.claap_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claap_id TEXT NOT NULL UNIQUE,
  title TEXT,
  recording_url TEXT,
  transcript TEXT,
  ai_summary TEXT,
  key_decisions TEXT[] DEFAULT '{}',
  next_steps TEXT[] DEFAULT '{}',
  topics TEXT[] DEFAULT '{}',
  sentiment TEXT, -- positive, neutral, negative
  organizer_email TEXT,
  duration_seconds INTEGER,
  started_at TIMESTAMPTZ,
  status claap_meeting_status NOT NULL DEFAULT 'pending_review',
  exclusion_reason TEXT,
  transcript_missing BOOLEAN DEFAULT false,
  no_internal_participant BOOLEAN DEFAULT false,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.claap_meetings ENABLE ROW LEVEL SECURITY;

-- Company-scoped access via organizer being in same company
CREATE POLICY "Users can view meetings linked to their company"
  ON public.claap_meetings FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()
    )
    OR organizer_email IN (
      SELECT p.email FROM public.profiles p WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update meetings they organize"
  ON public.claap_meetings FOR UPDATE TO authenticated
  USING (
    organizer_email IN (
      SELECT p.email FROM public.profiles p WHERE p.user_id = auth.uid()
    )
    OR public.is_company_admin(auth.uid(), company_id)
  );

-- ============================================
-- 2. claap_meeting_participants
-- ============================================
CREATE TABLE public.claap_meeting_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.claap_meetings(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  domain TEXT,
  is_internal BOOLEAN DEFAULT false,
  contact_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.claap_meeting_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view participants of accessible meetings"
  ON public.claap_meeting_participants FOR SELECT TO authenticated
  USING (
    meeting_id IN (SELECT id FROM public.claap_meetings)
  );

-- ============================================
-- 3. claap_routing_rules - Admin rule builder
-- ============================================
CREATE TABLE public.claap_routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  conditions JSONB NOT NULL DEFAULT '[]',
  condition_logic TEXT NOT NULL DEFAULT 'AND', -- AND or OR
  actions JSONB NOT NULL DEFAULT '[]',
  position INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.claap_routing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage routing rules"
  ON public.claap_routing_rules FOR ALL TO authenticated
  USING (
    public.is_company_admin(auth.uid(), company_id)
  )
  WITH CHECK (
    public.is_company_admin(auth.uid(), company_id)
  );

CREATE POLICY "Members can view routing rules"
  ON public.claap_routing_rules FOR SELECT TO authenticated
  USING (
    public.is_company_member(auth.uid(), company_id)
  );

-- ============================================
-- 4. claap_routing_tasks - Confirmation tasks
-- ============================================
CREATE TABLE public.claap_routing_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.claap_meetings(id) ON DELETE CASCADE,
  task_type claap_task_type NOT NULL,
  status claap_task_status NOT NULL DEFAULT 'pending',
  assigned_to UUID REFERENCES auth.users(id),
  prefilled_data JSONB DEFAULT '{}',
  resolved_data JSONB,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.claap_routing_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Assigned users can view their tasks"
  ON public.claap_routing_tasks FOR SELECT TO authenticated
  USING (assigned_to = auth.uid());

CREATE POLICY "Assigned users can update their tasks"
  ON public.claap_routing_tasks FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid());

-- ============================================
-- 5. claap_webhook_errors - Error log
-- ============================================
CREATE TABLE public.claap_webhook_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT,
  payload JSONB,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.claap_webhook_errors ENABLE ROW LEVEL SECURITY;

-- Only admins can view webhook errors
CREATE POLICY "Admins can view webhook errors"
  ON public.claap_webhook_errors FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ============================================
-- 6. claap_integration_config - Per-company settings
-- ============================================
CREATE TABLE public.claap_integration_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  internal_domains TEXT[] NOT NULL DEFAULT ARRAY['5thlinefinancing.com'],
  min_duration_seconds INTEGER NOT NULL DEFAULT 300,
  excluded_title_patterns TEXT[] NOT NULL DEFAULT ARRAY[
    '5th Line Weekly',
    'Partners Meeting',
    'Joint Work',
    'All Hands',
    'Monthly Insights',
    'Quarterly Insights'
  ],
  fallback_admin_user_id UUID REFERENCES auth.users(id),
  task_expiry_days INTEGER NOT NULL DEFAULT 7,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.claap_integration_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage claap config"
  ON public.claap_integration_config FOR ALL TO authenticated
  USING (public.is_company_admin(auth.uid(), company_id))
  WITH CHECK (public.is_company_admin(auth.uid(), company_id));

CREATE POLICY "Members can view claap config"
  ON public.claap_integration_config FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX idx_claap_meetings_claap_id ON public.claap_meetings(claap_id);
CREATE INDEX idx_claap_meetings_status ON public.claap_meetings(status);
CREATE INDEX idx_claap_meetings_company_id ON public.claap_meetings(company_id);
CREATE INDEX idx_claap_meetings_deal_id ON public.claap_meetings(deal_id);
CREATE INDEX idx_claap_meeting_participants_meeting_id ON public.claap_meeting_participants(meeting_id);
CREATE INDEX idx_claap_meeting_participants_email ON public.claap_meeting_participants(email);
CREATE INDEX idx_claap_routing_rules_company_id ON public.claap_routing_rules(company_id);
CREATE INDEX idx_claap_routing_tasks_meeting_id ON public.claap_routing_tasks(meeting_id);
CREATE INDEX idx_claap_routing_tasks_assigned_to ON public.claap_routing_tasks(assigned_to);
CREATE INDEX idx_claap_routing_tasks_status ON public.claap_routing_tasks(status);

-- ============================================
-- Triggers for updated_at
-- ============================================
CREATE TRIGGER update_claap_meetings_updated_at
  BEFORE UPDATE ON public.claap_meetings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_claap_routing_rules_updated_at
  BEFORE UPDATE ON public.claap_routing_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_claap_routing_tasks_updated_at
  BEFORE UPDATE ON public.claap_routing_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_claap_integration_config_updated_at
  BEFORE UPDATE ON public.claap_integration_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
