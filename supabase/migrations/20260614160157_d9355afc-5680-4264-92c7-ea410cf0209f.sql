
ALTER TABLE public.admin_agent_user_overrides
  ADD COLUMN IF NOT EXISTS is_activated boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.admin_agent_user_overrides.is_activated IS
  'Per-user activation gate for the Admin Agent. When false (default), the Admin Agent must refuse chat actions and skip this user in the proactive sweep.';

CREATE INDEX IF NOT EXISTS admin_agent_user_overrides_activated_idx
  ON public.admin_agent_user_overrides (company_id, user_id)
  WHERE is_activated = true;

CREATE OR REPLACE FUNCTION public.is_admin_agent_activated(
  p_user_id uuid,
  p_company_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_agent_user_overrides
    WHERE user_id = p_user_id
      AND company_id = p_company_id
      AND is_activated = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_agent_activated(uuid, uuid)
  TO authenticated, service_role;
