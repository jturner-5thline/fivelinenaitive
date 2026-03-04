
-- Create support_sessions table
CREATE TABLE public.support_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  support_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

ALTER TABLE public.support_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "5thline_admin_select_support_sessions"
  ON public.support_sessions FOR SELECT TO authenticated
  USING (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'support_admin'))
    AND public.is_5thline_user(auth.uid())
  );

CREATE POLICY "5thline_admin_insert_support_sessions"
  ON public.support_sessions FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'support_admin'))
    AND public.is_5thline_user(auth.uid())
    AND support_user_id = auth.uid()
  );

CREATE POLICY "5thline_admin_update_support_sessions"
  ON public.support_sessions FOR UPDATE TO authenticated
  USING (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'support_admin'))
    AND public.is_5thline_user(auth.uid())
    AND support_user_id = auth.uid()
  )
  WITH CHECK (support_user_id = auth.uid());

-- Create support_audit_logs table
CREATE TABLE public.support_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  support_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "5thline_admin_select_support_audit_logs"
  ON public.support_audit_logs FOR SELECT TO authenticated
  USING (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'support_admin'))
    AND public.is_5thline_user(auth.uid())
  );

CREATE POLICY "5thline_admin_insert_support_audit_logs"
  ON public.support_audit_logs FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'support_admin'))
    AND public.is_5thline_user(auth.uid())
    AND support_user_id = auth.uid()
  );

-- Indexes
CREATE INDEX idx_support_audit_logs_company ON public.support_audit_logs (target_company_id, created_at DESC);
CREATE INDEX idx_support_audit_logs_user ON public.support_audit_logs (support_user_id, created_at DESC);
CREATE INDEX idx_support_sessions_active ON public.support_sessions (support_user_id) WHERE ended_at IS NULL;
