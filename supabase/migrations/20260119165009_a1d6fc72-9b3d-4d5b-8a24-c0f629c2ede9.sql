-- Add archived_at column to companies table
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add archived_reason column to companies table
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS archived_reason TEXT DEFAULT NULL;

-- Create function to archive a company
CREATE OR REPLACE FUNCTION public.admin_archive_company(_company_id uuid, _archive boolean, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  company_name text;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can archive companies';
  END IF;
  
  SELECT name INTO company_name FROM public.companies WHERE id = _company_id;
  
  IF _archive THEN
    UPDATE public.companies 
    SET archived_at = now(), archived_reason = _reason
    WHERE id = _company_id;
    
    PERFORM public.log_admin_action(
      'company_archived',
      'company',
      _company_id,
      company_name,
      jsonb_build_object('reason', _reason)
    );
  ELSE
    UPDATE public.companies 
    SET archived_at = NULL, archived_reason = NULL
    WHERE id = _company_id;
    
    PERFORM public.log_admin_action(
      'company_unarchived',
      'company',
      _company_id,
      company_name,
      '{}'::jsonb
    );
  END IF;
END;
$$;