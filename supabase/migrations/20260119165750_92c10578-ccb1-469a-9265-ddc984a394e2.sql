-- Add suspension columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS suspended_reason TEXT;

-- Create admin function to toggle user suspension
CREATE OR REPLACE FUNCTION public.admin_toggle_user_suspension(
  _user_id UUID,
  _suspend BOOLEAN,
  _reason TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied: Admin role required';
  END IF;

  -- Update the profile
  UPDATE public.profiles
  SET 
    suspended_at = CASE WHEN _suspend THEN now() ELSE NULL END,
    suspended_reason = CASE WHEN _suspend THEN _reason ELSE NULL END,
    updated_at = now()
  WHERE user_id = _user_id;
  
  -- Log the action
  INSERT INTO public.admin_audit_logs (
    admin_user_id,
    action_type,
    target_type,
    target_id,
    details
  ) VALUES (
    auth.uid(),
    CASE WHEN _suspend THEN 'suspend_user' ELSE 'unsuspend_user' END,
    'user',
    _user_id::text,
    jsonb_build_object('reason', _reason)
  );
END;
$$;