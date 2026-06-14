
CREATE TABLE IF NOT EXISTS public.company_agent_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  agent_key text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  access_mode text NULL CHECK (access_mode IN ('disabled','enabled','pilot','internal')),
  enabled_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_agent_access_unique UNIQUE (company_id, agent_key)
);

CREATE INDEX IF NOT EXISTS idx_company_agent_access_company ON public.company_agent_access(company_id);
CREATE INDEX IF NOT EXISTS idx_company_agent_access_agent ON public.company_agent_access(agent_key);
CREATE INDEX IF NOT EXISTS idx_company_agent_access_enabled ON public.company_agent_access(is_enabled);

GRANT SELECT ON public.company_agent_access TO authenticated;
GRANT ALL ON public.company_agent_access TO service_role;

ALTER TABLE public.company_agent_access ENABLE ROW LEVEL SECURITY;

-- Members of the company can read their own entitlement rows (used by UI to
-- show "Admin Agent is not enabled for this company" disabled states).
CREATE POLICY "Members can read their company agent access"
  ON public.company_agent_access
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = company_agent_access.company_id
        AND cm.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- Only platform admins manage rows.
CREATE POLICY "Admins manage company agent access"
  ON public.company_agent_access
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_company_agent_access_updated_at
  BEFORE UPDATE ON public.company_agent_access
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Helper RPCs ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_agent_enabled_for_company(
  p_company_id uuid,
  p_agent_key text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_agent_access
    WHERE company_id = p_company_id
      AND agent_key = p_agent_key
      AND is_enabled = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_agent_enabled_for_company(uuid, text) TO authenticated, service_role, anon;

CREATE OR REPLACE FUNCTION public.can_user_use_agent(
  p_user_id uuid,
  p_company_id uuid,
  p_agent_key text
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_ok boolean;
  v_user_ok boolean;
BEGIN
  IF p_user_id IS NULL OR p_company_id IS NULL OR p_agent_key IS NULL THEN
    RETURN false;
  END IF;

  SELECT public.is_agent_enabled_for_company(p_company_id, p_agent_key) INTO v_company_ok;
  IF NOT v_company_ok THEN
    RETURN false;
  END IF;

  -- Per-agent secondary gate. Today only admin_agent has a per-user
  -- activation flag; other agents pass straight through.
  IF p_agent_key = 'admin_agent' THEN
    SELECT public.is_admin_agent_activated(p_user_id, p_company_id) INTO v_user_ok;
    RETURN COALESCE(v_user_ok, false);
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_user_use_agent(uuid, uuid, text) TO authenticated, service_role;
