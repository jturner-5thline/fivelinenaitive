-- =========================================================
-- Admin Agent · Duty 1 (Verify Deal Information)
-- Foundation: settings, user overrides, holidays, audit runs
-- =========================================================

-- 1) Settings (one row per company)
CREATE TABLE public.admin_agent_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  -- Scope: which pipelines/stages count as "active" for the audit.
  -- Empty arrays mean "use the company's default pipeline + all its non-terminal stages".
  active_pipeline_ids uuid[] NOT NULL DEFAULT '{}',
  active_stage_ids text[] NOT NULL DEFAULT '{}',
  -- Critical fields the audit inspects (default mirrors the spec).
  critical_fields text[] NOT NULL DEFAULT ARRAY['status','stage','milestones','status_notes','funding_sources']::text[],
  -- Freshness threshold in US business days. Items older than this are "may_need_review".
  stale_threshold_business_days smallint NOT NULL DEFAULT 3 CHECK (stale_threshold_business_days BETWEEN 1 AND 30),
  -- Friday end-of-week strict sweep.
  friday_sweep_enabled boolean NOT NULL DEFAULT true,
  -- Default chat behavior knobs.
  default_chat_behavior jsonb NOT NULL DEFAULT jsonb_build_object(
    'portfolio_page_size', 3,
    'show_more', true,
    'ask_before_writes', true,
    'group_by', 'deal'
  ),
  advisory_tone boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_agent_settings_company_unique UNIQUE (company_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_agent_settings TO authenticated;
GRANT ALL ON public.admin_agent_settings TO service_role;
ALTER TABLE public.admin_agent_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view their company's admin agent settings"
  ON public.admin_agent_settings FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Admins manage their company's admin agent settings (insert)"
  ON public.admin_agent_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_company_admin(auth.uid(), company_id));

CREATE POLICY "Admins manage their company's admin agent settings (update)"
  ON public.admin_agent_settings FOR UPDATE TO authenticated
  USING (public.is_company_admin(auth.uid(), company_id))
  WITH CHECK (public.is_company_admin(auth.uid(), company_id));

CREATE POLICY "Admins manage their company's admin agent settings (delete)"
  ON public.admin_agent_settings FOR DELETE TO authenticated
  USING (public.is_company_admin(auth.uid(), company_id));

-- 2) Per-user overrides
CREATE TABLE public.admin_agent_user_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_agent_user_override_unique UNIQUE (company_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_agent_user_overrides TO authenticated;
GRANT ALL ON public.admin_agent_user_overrides TO service_role;
ALTER TABLE public.admin_agent_user_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own override or company admins see all"
  ON public.admin_agent_user_overrides FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_company_admin(auth.uid(), company_id));

CREATE POLICY "Users insert their own override; admins insert any"
  ON public.admin_agent_user_overrides FOR INSERT TO authenticated
  WITH CHECK (
    (user_id = auth.uid() AND public.is_company_member(auth.uid(), company_id))
    OR public.is_company_admin(auth.uid(), company_id)
  );

CREATE POLICY "Users update their own override; admins update any"
  ON public.admin_agent_user_overrides FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_company_admin(auth.uid(), company_id))
  WITH CHECK (user_id = auth.uid() OR public.is_company_admin(auth.uid(), company_id));

CREATE POLICY "Users delete their own override; admins delete any"
  ON public.admin_agent_user_overrides FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_company_admin(auth.uid(), company_id));

-- 3) Company-defined non-business days (unioned with US federal holidays in code).
CREATE TABLE public.admin_agent_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  holiday_date date NOT NULL,
  label text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_agent_holiday_unique UNIQUE (company_id, holiday_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_agent_holidays TO authenticated;
GRANT ALL ON public.admin_agent_holidays TO service_role;
ALTER TABLE public.admin_agent_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view their company's holidays"
  ON public.admin_agent_holidays FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Admins insert holidays"
  ON public.admin_agent_holidays FOR INSERT TO authenticated
  WITH CHECK (public.is_company_admin(auth.uid(), company_id));

CREATE POLICY "Admins update holidays"
  ON public.admin_agent_holidays FOR UPDATE TO authenticated
  USING (public.is_company_admin(auth.uid(), company_id))
  WITH CHECK (public.is_company_admin(auth.uid(), company_id));

CREATE POLICY "Admins delete holidays"
  ON public.admin_agent_holidays FOR DELETE TO authenticated
  USING (public.is_company_admin(auth.uid(), company_id));

-- 4) Audit-run history
CREATE TABLE public.admin_agent_audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid,
  scope_type text NOT NULL CHECK (scope_type IN ('portfolio','single_deal')),
  deal_ids uuid[] NOT NULL DEFAULT '{}',
  findings_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_evaluated integer NOT NULL DEFAULT 0,
  total_flagged integer NOT NULL DEFAULT 0,
  total_never_updated integer NOT NULL DEFAULT 0,
  triggered_by text NOT NULL DEFAULT 'chat' CHECK (triggered_by IN ('chat','friday_sweep','manual','scheduled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.admin_agent_audit_runs TO authenticated;
GRANT ALL ON public.admin_agent_audit_runs TO service_role;
ALTER TABLE public.admin_agent_audit_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view their company's audit runs"
  ON public.admin_agent_audit_runs FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members insert audit runs for their company"
  ON public.admin_agent_audit_runs FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE INDEX idx_admin_agent_audit_runs_company_created
  ON public.admin_agent_audit_runs (company_id, created_at DESC);
CREATE INDEX idx_admin_agent_audit_runs_user_created
  ON public.admin_agent_audit_runs (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
CREATE INDEX idx_admin_agent_holidays_company_date
  ON public.admin_agent_holidays (company_id, holiday_date);

-- 5) updated_at trigger (reuse existing helper)
CREATE TRIGGER admin_agent_settings_set_updated_at
  BEFORE UPDATE ON public.admin_agent_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER admin_agent_user_overrides_set_updated_at
  BEFORE UPDATE ON public.admin_agent_user_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();