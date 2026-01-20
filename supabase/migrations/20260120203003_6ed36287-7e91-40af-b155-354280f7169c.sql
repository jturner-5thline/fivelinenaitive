-- Create function for bulk approving users (admin only)
CREATE OR REPLACE FUNCTION public.admin_bulk_approve_users(_user_ids uuid[])
RETURNS TABLE(user_id uuid, email text, display_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  approved_user RECORD;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can approve users';
  END IF;
  
  -- Update all users at once
  UPDATE public.profiles
  SET approved_at = now(), approved_by = auth.uid()
  WHERE profiles.user_id = ANY(_user_ids)
    AND approved_at IS NULL;
  
  -- Return info about approved users for notifications
  RETURN QUERY
  SELECT p.user_id, p.email, p.display_name
  FROM public.profiles p
  WHERE p.user_id = ANY(_user_ids);
  
  -- Log the bulk action
  PERFORM public.log_admin_action(
    'users_bulk_approved',
    'user',
    NULL,
    array_length(_user_ids, 1)::text || ' users',
    jsonb_build_object('user_ids', _user_ids)
  );
END;
$$;