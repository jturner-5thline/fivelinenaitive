
CREATE TABLE IF NOT EXISTS public.admin_impersonation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_admin_user_id uuid NOT NULL,
  source_admin_email text,
  target_demo_user_id uuid NOT NULL,
  target_demo_email text,
  target_demo_company_id uuid,
  target_demo_company_name text,
  source_surface text NOT NULL DEFAULT 'admin/demo-metrics',
  nonce text NOT NULL,
  ip_address text,
  user_agent text,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 hours'),
  ended_at timestamptz,
  ended_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_impersonation_sessions TO authenticated;
GRANT ALL    ON public.admin_impersonation_sessions TO service_role;

ALTER TABLE public.admin_impersonation_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Source admin can read own impersonation sessions"
  ON public.admin_impersonation_sessions
  FOR SELECT TO authenticated
  USING (source_admin_user_id = auth.uid());

CREATE POLICY "Target demo user can read own active impersonation session"
  ON public.admin_impersonation_sessions
  FOR SELECT TO authenticated
  USING (target_demo_user_id = auth.uid() AND ended_at IS NULL AND expires_at > now());

CREATE INDEX IF NOT EXISTS admin_impersonation_sessions_target_active_idx
  ON public.admin_impersonation_sessions (target_demo_user_id)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS admin_impersonation_sessions_source_idx
  ON public.admin_impersonation_sessions (source_admin_user_id, started_at DESC);

CREATE OR REPLACE FUNCTION public.has_active_admin_impersonation(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_impersonation_sessions
    WHERE target_demo_user_id = _user_id
      AND ended_at IS NULL
      AND expires_at > now()
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_active_admin_impersonation(uuid) TO authenticated;
