-- Create admin function to delete a company
CREATE OR REPLACE FUNCTION public.admin_delete_company(_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can delete companies';
  END IF;
  
  -- Delete the company (cascades will handle related data)
  DELETE FROM public.companies WHERE id = _company_id;
END;
$$;