CREATE OR REPLACE FUNCTION public.ensure_user_workspace(
  _company_name text DEFAULT NULL,
  _company_url text DEFAULT NULL,
  _company_size text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _existing_company_id uuid;
  _resolved_company_name text;
  _profile_company_name text;
  _profile_email text;
  _new_company_id uuid;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT cm.company_id
  INTO _existing_company_id
  FROM public.company_members cm
  WHERE cm.user_id = _user_id
  ORDER BY cm.created_at ASC
  LIMIT 1;

  IF _existing_company_id IS NOT NULL THEN
    RETURN _existing_company_id;
  END IF;

  SELECT p.company_name, p.email
  INTO _profile_company_name, _profile_email
  FROM public.profiles p
  WHERE p.user_id = _user_id;

  _resolved_company_name := NULLIF(trim(COALESCE(_company_name, _profile_company_name)), '');

  IF _resolved_company_name IS NULL THEN
    _resolved_company_name := COALESCE(
      NULLIF(initcap(split_part(COALESCE(_profile_email, ''), '@', 1)), ''),
      'My Workspace'
    ) || ' Workspace';
  END IF;

  INSERT INTO public.companies (
    name,
    website_url,
    employee_size
  )
  VALUES (
    _resolved_company_name,
    NULLIF(trim(_company_url), ''),
    NULLIF(trim(_company_size), '')
  )
  RETURNING id INTO _new_company_id;

  INSERT INTO public.company_members (
    company_id,
    user_id,
    role
  )
  VALUES (
    _new_company_id,
    _user_id,
    'owner'
  );

  RETURN _new_company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_user_workspace(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_user_workspace(text, text, text) TO authenticated;