
-- Admin function to add a user to a company by email
CREATE OR REPLACE FUNCTION public.admin_add_company_member(_company_id uuid, _user_email text, _role company_role DEFAULT 'member'::company_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can add company members';
  END IF;

  SELECT user_id INTO target_user_id FROM public.profiles WHERE lower(email) = lower(_user_email);
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', _user_email;
  END IF;

  INSERT INTO public.company_members (company_id, user_id, role)
  VALUES (_company_id, target_user_id, _role)
  ON CONFLICT (company_id, user_id) DO UPDATE SET role = _role, updated_at = now();

  -- Approve user if not already
  UPDATE public.profiles SET approved_at = COALESCE(approved_at, now()), approved_by = COALESCE(approved_by, auth.uid())
  WHERE user_id = target_user_id AND approved_at IS NULL;
END;
$$;

-- Admin function to update a company member's role
CREATE OR REPLACE FUNCTION public.admin_update_company_member_role(_company_id uuid, _user_id uuid, _new_role company_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can update member roles';
  END IF;

  UPDATE public.company_members
  SET role = _new_role, updated_at = now()
  WHERE company_id = _company_id AND user_id = _user_id;
END;
$$;

-- Admin function to remove a company member
CREATE OR REPLACE FUNCTION public.admin_remove_company_member(_company_id uuid, _user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can remove company members';
  END IF;

  DELETE FROM public.company_members
  WHERE company_id = _company_id AND user_id = _user_id;
END;
$$;
