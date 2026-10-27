ALTER TABLE public.company_invitations ADD COLUMN IF NOT EXISTS accepted_by uuid;
COMMENT ON COLUMN public.company_invitations.accepted_by IS 'Authenticated user who consumed the invitation through the trusted acceptance operation.';

CREATE OR REPLACE FUNCTION public.accept_company_invitation(_token uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  caller_id uuid := auth.uid();
  caller_email text;
  invite public.company_invitations%ROWTYPE;
  caller_profile public.profiles%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Sign in to accept an invitation' USING ERRCODE = '42501';
  END IF;

  SELECT lower(email) INTO caller_email FROM auth.users
  WHERE id = caller_id AND email_confirmed_at IS NOT NULL;
  IF caller_email IS NULL THEN
    RAISE EXCEPTION 'Verify your email before accepting an invitation' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO invite FROM public.company_invitations WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid invitation' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO caller_profile FROM public.profiles WHERE user_id = caller_id FOR UPDATE;
  IF NOT FOUND OR caller_profile.suspended_at IS NOT NULL THEN
    RAISE EXCEPTION 'Account is unavailable' USING ERRCODE = '42501';
  END IF;
  IF caller_profile.approved_at IS NULL AND EXISTS (
    SELECT 1 FROM public.admin_audit_logs
    WHERE target_id = caller_id AND action_type = 'user_approval_revoked'
  ) THEN
    RAISE EXCEPTION 'Administrator approval is required for this account' USING ERRCODE = '42501';
  END IF;

  IF invite.accepted_at IS NOT NULL THEN
    IF invite.accepted_by = caller_id AND EXISTS (
      SELECT 1 FROM public.company_members WHERE company_id = invite.company_id AND user_id = caller_id
    ) THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'Invitation has already been accepted' USING ERRCODE = '22023';
  END IF;
  IF invite.expires_at <= now() THEN
    RAISE EXCEPTION 'Invitation has expired' USING ERRCODE = '22023';
  END IF;
  IF lower(invite.email) <> caller_email AND invite.email NOT LIKE 'link-invite-%@placeholder.local' THEN
    RAISE EXCEPTION 'Sign in with the email address that received this invitation' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.company_members m
    JOIN public.profiles p ON p.user_id = m.user_id
    JOIN public.companies c ON c.id = m.company_id
    WHERE m.user_id = invite.invited_by AND m.company_id = invite.company_id
      AND public.is_user_approved(m.user_id)
      AND p.suspended_at IS NULL AND c.suspended_at IS NULL AND c.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Invitation is no longer authorized' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.company_members (company_id, user_id, role)
  VALUES (invite.company_id, caller_id, invite.role)
  ON CONFLICT (company_id, user_id) DO NOTHING;

  UPDATE public.company_invitations
  SET accepted_at = now(), accepted_by = caller_id WHERE id = invite.id;

  UPDATE public.profiles
  SET approved_at = now(), approved_by = invite.invited_by
  WHERE user_id = caller_id AND approved_at IS NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.accept_company_invitation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_company_invitation(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.accept_company_invitation(uuid) IS 'Atomically consume a verified team invitation, retain existing roles, and approve the invitee without overriding administrator revocations.';