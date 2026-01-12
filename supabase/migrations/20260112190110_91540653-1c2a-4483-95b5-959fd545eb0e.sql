-- Add suspended field to companies
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS suspended_at timestamp with time zone DEFAULT NULL;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS suspended_reason text DEFAULT NULL;

-- Create admin function to get company members
CREATE OR REPLACE FUNCTION public.admin_get_company_members(_company_id uuid)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  role company_role,
  created_at timestamp with time zone,
  display_name text,
  email text,
  avatar_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    cm.id,
    cm.user_id,
    cm.role,
    cm.created_at,
    p.display_name,
    p.email,
    p.avatar_url
  FROM public.company_members cm
  JOIN public.profiles p ON p.user_id = cm.user_id
  WHERE cm.company_id = _company_id
    AND public.is_admin(auth.uid())
  ORDER BY cm.created_at
$$;

-- Create admin function to get company stats
CREATE OR REPLACE FUNCTION public.admin_get_company_stats(_company_id uuid)
RETURNS TABLE(
  total_deals bigint,
  active_deals bigint,
  total_lenders bigint,
  total_deal_value numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    COUNT(DISTINCT d.id) as total_deals,
    COUNT(DISTINCT CASE WHEN d.status = 'active' THEN d.id END) as active_deals,
    COUNT(DISTINCT dl.id) as total_lenders,
    COALESCE(SUM(d.value), 0) as total_deal_value
  FROM public.deals d
  LEFT JOIN public.deal_lenders dl ON dl.deal_id = d.id
  WHERE d.company_id = _company_id
    AND public.is_admin(auth.uid())
$$;

-- Create admin function to get company activity
CREATE OR REPLACE FUNCTION public.admin_get_company_activity(_company_id uuid, _limit integer DEFAULT 20)
RETURNS TABLE(
  id uuid,
  deal_id uuid,
  deal_name text,
  activity_type text,
  description text,
  created_at timestamp with time zone,
  user_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    al.id,
    al.deal_id,
    d.company as deal_name,
    al.activity_type,
    al.description,
    al.created_at,
    p.display_name as user_name
  FROM public.activity_logs al
  JOIN public.deals d ON d.id = al.deal_id
  LEFT JOIN public.profiles p ON p.user_id = al.user_id
  WHERE d.company_id = _company_id
    AND public.is_admin(auth.uid())
  ORDER BY al.created_at DESC
  LIMIT _limit
$$;

-- Create admin function to suspend/unsuspend company
CREATE OR REPLACE FUNCTION public.admin_toggle_company_suspension(_company_id uuid, _suspend boolean, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can suspend companies';
  END IF;
  
  IF _suspend THEN
    UPDATE public.companies 
    SET suspended_at = now(), suspended_reason = _reason
    WHERE id = _company_id;
  ELSE
    UPDATE public.companies 
    SET suspended_at = NULL, suspended_reason = NULL
    WHERE id = _company_id;
  END IF;
END;
$$;