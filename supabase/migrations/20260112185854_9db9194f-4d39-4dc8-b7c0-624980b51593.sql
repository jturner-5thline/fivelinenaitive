-- Create a secure function for admins to delete users
CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if the caller is an admin
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can delete users';
  END IF;
  
  -- Prevent admins from deleting themselves
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete your own account';
  END IF;
  
  -- Delete the user from auth.users (this will cascade to profiles, company_members, etc.)
  DELETE FROM auth.users WHERE id = _user_id;
END;
$$;