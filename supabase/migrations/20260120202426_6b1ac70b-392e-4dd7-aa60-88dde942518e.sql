-- Add approval fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS approval_requested_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Create function to check if user is approved (5thline.co users are auto-approved)
CREATE OR REPLACE FUNCTION public.is_user_approved(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.user_id
    WHERE p.user_id = _user_id
      AND (
        -- 5thline.co users are always approved
        u.email LIKE '%@5thline.co'
        -- Or user has been manually approved
        OR p.approved_at IS NOT NULL
      )
  )
$$;

-- Create function to get pending approval users (admin only)
CREATE OR REPLACE FUNCTION public.admin_get_pending_approvals()
RETURNS TABLE(
  user_id uuid,
  email text,
  display_name text,
  first_name text,
  last_name text,
  avatar_url text,
  created_at timestamp with time zone,
  approval_requested_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.user_id,
    p.email,
    p.display_name,
    p.first_name,
    p.last_name,
    p.avatar_url,
    p.created_at,
    p.approval_requested_at
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.user_id
  WHERE public.is_admin(auth.uid())
    AND p.approved_at IS NULL
    AND u.email NOT LIKE '%@5thline.co'
  ORDER BY p.created_at DESC
$$;

-- Create function to approve a user (admin only)
CREATE OR REPLACE FUNCTION public.admin_approve_user(_user_id uuid)
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
    RAISE EXCEPTION 'Only admins can approve users';
  END IF;
  
  -- Get user info
  SELECT email, display_name INTO user_email, user_name
  FROM public.profiles WHERE user_id = _user_id;
  
  -- Approve the user
  UPDATE public.profiles
  SET approved_at = now(), approved_by = auth.uid()
  WHERE user_id = _user_id;
  
  -- Log the action
  PERFORM public.log_admin_action(
    'user_approved',
    'user',
    _user_id,
    COALESCE(user_name, user_email),
    jsonb_build_object('email', user_email)
  );
END;
$$;

-- Create function to reject/revoke approval (admin only)
CREATE OR REPLACE FUNCTION public.admin_revoke_approval(_user_id uuid)
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
    RAISE EXCEPTION 'Only admins can revoke user approval';
  END IF;
  
  -- Get user info
  SELECT email, display_name INTO user_email, user_name
  FROM public.profiles WHERE user_id = _user_id;
  
  -- Revoke approval
  UPDATE public.profiles
  SET approved_at = NULL, approved_by = NULL
  WHERE user_id = _user_id;
  
  -- Log the action
  PERFORM public.log_admin_action(
    'user_approval_revoked',
    'user',
    _user_id,
    COALESCE(user_name, user_email),
    jsonb_build_object('email', user_email)
  );
END;
$$;