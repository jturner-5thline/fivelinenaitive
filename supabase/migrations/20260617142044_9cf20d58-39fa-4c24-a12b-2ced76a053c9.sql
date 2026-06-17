CREATE OR REPLACE FUNCTION public.can_use_approval_queue(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Canonical 5th Line company id. Must stay in sync with the frontend
  -- constant FIFTH_LINE_COMPANY_ID in src/hooks/useNaitivePipelineAccess.ts.
  -- The Approval Queue is restricted to members of this org; no email-domain
  -- check, no feature-flag dependency.
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members
    WHERE user_id = _user_id
      AND company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid
  );
$$;

COMMENT ON FUNCTION public.can_use_approval_queue(uuid) IS
  'Approval Queue access gate. Single source of truth: membership in the canonical 5th Line company (44556c46-9127-4b12-b14e-d6fee784afcf). Mirrors FIFTH_LINE_COMPANY_ID in src/hooks/useNaitivePipelineAccess.ts.';