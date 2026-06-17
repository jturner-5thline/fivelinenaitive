CREATE TABLE IF NOT EXISTS public.admin_impersonation_session_secrets (
  session_id uuid PRIMARY KEY REFERENCES public.admin_impersonation_sessions(id) ON DELETE CASCADE,
  source_admin_refresh_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz
);

GRANT ALL ON public.admin_impersonation_session_secrets TO service_role;

ALTER TABLE public.admin_impersonation_session_secrets ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS admin_impersonation_session_secrets_created_idx
  ON public.admin_impersonation_session_secrets (created_at DESC);