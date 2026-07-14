
CREATE OR REPLACE FUNCTION public.enforce_admin_agent_enabled_on_ai_action_queue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_enabled boolean;
BEGIN
  -- Resolve company via deal first (most reliable), then via user membership.
  IF NEW.deal_id IS NOT NULL THEN
    SELECT company_id INTO v_company_id FROM public.deals WHERE id = NEW.deal_id;
  END IF;

  IF v_company_id IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT company_id INTO v_company_id
    FROM public.company_members
    WHERE user_id = NEW.user_id
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  -- If we can't determine a company, block — the agent-enabled gate cannot be evaluated.
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Approval Queue insert blocked: unable to resolve company for gating check'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT enabled INTO v_enabled
  FROM public.admin_agent_settings
  WHERE company_id = v_company_id;

  IF v_enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'Approval Queue insert blocked: Deal Admin Agent is not enabled for this workspace'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_admin_agent_enabled_on_ai_action_queue ON public.ai_action_queue;

CREATE TRIGGER trg_enforce_admin_agent_enabled_on_ai_action_queue
BEFORE INSERT ON public.ai_action_queue
FOR EACH ROW
EXECUTE FUNCTION public.enforce_admin_agent_enabled_on_ai_action_queue();

COMMENT ON FUNCTION public.enforce_admin_agent_enabled_on_ai_action_queue() IS
  'Master kill-switch for the Approval Queue. Every insert into ai_action_queue must be for a company whose admin_agent_settings.enabled = true. Resolves company via deal_id, falling back to the creating user''s primary company_members row.';
