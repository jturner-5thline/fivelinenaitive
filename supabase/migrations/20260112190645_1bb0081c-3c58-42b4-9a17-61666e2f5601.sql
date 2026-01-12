-- Create admin audit log table
CREATE TABLE public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  action_type text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  target_name text,
  details jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "Admins can view audit logs"
ON public.admin_audit_logs
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

-- Create function to log admin actions
CREATE OR REPLACE FUNCTION public.log_admin_action(
  _action_type text,
  _target_type text,
  _target_id uuid DEFAULT NULL,
  _target_name text DEFAULT NULL,
  _details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  log_id uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can log admin actions';
  END IF;
  
  INSERT INTO public.admin_audit_logs (admin_user_id, action_type, target_type, target_id, target_name, details)
  VALUES (auth.uid(), _action_type, _target_type, _target_id, _target_name, _details)
  RETURNING id INTO log_id;
  
  RETURN log_id;
END;
$$;

-- Update admin_delete_user to log action
CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email text;
  user_name text;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can delete users';
  END IF;
  
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete your own account';
  END IF;
  
  -- Get user info before deletion
  SELECT email, display_name INTO user_email, user_name
  FROM public.profiles WHERE user_id = _user_id;
  
  -- Log the action
  PERFORM public.log_admin_action(
    'user_deleted',
    'user',
    _user_id,
    COALESCE(user_name, user_email),
    jsonb_build_object('email', user_email)
  );
  
  DELETE FROM auth.users WHERE id = _user_id;
END;
$$;

-- Update admin_delete_company to log action
CREATE OR REPLACE FUNCTION public.admin_delete_company(_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  company_name text;
  member_count bigint;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can delete companies';
  END IF;
  
  -- Get company info before deletion
  SELECT name INTO company_name FROM public.companies WHERE id = _company_id;
  SELECT COUNT(*) INTO member_count FROM public.company_members WHERE company_id = _company_id;
  
  -- Log the action
  PERFORM public.log_admin_action(
    'company_deleted',
    'company',
    _company_id,
    company_name,
    jsonb_build_object('member_count', member_count)
  );
  
  DELETE FROM public.companies WHERE id = _company_id;
END;
$$;

-- Update admin_toggle_company_suspension to log action
CREATE OR REPLACE FUNCTION public.admin_toggle_company_suspension(_company_id uuid, _suspend boolean, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  company_name text;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can suspend companies';
  END IF;
  
  SELECT name INTO company_name FROM public.companies WHERE id = _company_id;
  
  IF _suspend THEN
    UPDATE public.companies 
    SET suspended_at = now(), suspended_reason = _reason
    WHERE id = _company_id;
    
    PERFORM public.log_admin_action(
      'company_suspended',
      'company',
      _company_id,
      company_name,
      jsonb_build_object('reason', _reason)
    );
  ELSE
    UPDATE public.companies 
    SET suspended_at = NULL, suspended_reason = NULL
    WHERE id = _company_id;
    
    PERFORM public.log_admin_action(
      'company_unsuspended',
      'company',
      _company_id,
      company_name,
      '{}'::jsonb
    );
  END IF;
END;
$$;

-- Create function to get audit logs
CREATE OR REPLACE FUNCTION public.admin_get_audit_logs(_limit integer DEFAULT 50, _offset integer DEFAULT 0)
RETURNS TABLE(
  id uuid,
  admin_user_id uuid,
  admin_name text,
  admin_email text,
  action_type text,
  target_type text,
  target_id uuid,
  target_name text,
  details jsonb,
  created_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    al.id,
    al.admin_user_id,
    p.display_name as admin_name,
    p.email as admin_email,
    al.action_type,
    al.target_type,
    al.target_id,
    al.target_name,
    al.details,
    al.created_at
  FROM public.admin_audit_logs al
  LEFT JOIN public.profiles p ON p.user_id = al.admin_user_id
  WHERE public.is_admin(auth.uid())
  ORDER BY al.created_at DESC
  LIMIT _limit
  OFFSET _offset
$$;