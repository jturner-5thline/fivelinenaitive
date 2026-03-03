
-- Add domain fields to companies
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS primary_domain text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS domains text[] DEFAULT '{}';

-- Create index for domain lookups
CREATE INDEX IF NOT EXISTS idx_companies_primary_domain ON public.companies (primary_domain);
CREATE INDEX IF NOT EXISTS idx_companies_domains ON public.companies USING GIN (domains);

-- Create company_join_requests table
CREATE TABLE public.company_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  note text,
  rejection_note text,
  decided_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  decision_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, company_id, status)
);

-- Enable RLS
ALTER TABLE public.company_join_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own join requests
CREATE POLICY "Users can view own join requests"
ON public.company_join_requests
FOR SELECT
USING (auth.uid() = user_id);

-- Company admins can view join requests for their company
CREATE POLICY "Company admins can view company join requests"
ON public.company_join_requests
FOR SELECT
USING (
  public.is_company_admin(auth.uid(), company_id)
  OR public.is_admin(auth.uid())
);

-- Authenticated users can create join requests for themselves
CREATE POLICY "Users can create own join requests"
ON public.company_join_requests
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Company admins can update join requests (approve/reject)
CREATE POLICY "Company admins can update join requests"
ON public.company_join_requests
FOR UPDATE
USING (
  public.is_company_admin(auth.uid(), company_id)
  OR public.is_admin(auth.uid())
);

-- Trigger for updated_at
CREATE TRIGGER update_company_join_requests_updated_at
BEFORE UPDATE ON public.company_join_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to find companies by email domain
CREATE OR REPLACE FUNCTION public.find_companies_by_domain(_domain text)
RETURNS TABLE(id uuid, name text, logo_url text, primary_domain text, member_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    c.id,
    c.name,
    c.logo_url,
    c.primary_domain,
    (SELECT COUNT(*) FROM public.company_members cm WHERE cm.company_id = c.id) as member_count
  FROM public.companies c
  WHERE c.primary_domain = _domain
     OR _domain = ANY(c.domains)
  ORDER BY c.created_at ASC;
$$;

-- Function to approve a join request (company admin action)
CREATE OR REPLACE FUNCTION public.approve_join_request(_request_id uuid, _role company_role DEFAULT 'member')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req RECORD;
BEGIN
  -- Get the request
  SELECT * INTO req FROM public.company_join_requests WHERE id = _request_id AND status = 'pending';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Join request not found or already processed';
  END IF;

  -- Check caller is company admin or platform admin
  IF NOT (public.is_company_admin(auth.uid(), req.company_id) OR public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Only company admins can approve join requests';
  END IF;

  -- Update request status
  UPDATE public.company_join_requests
  SET status = 'approved', decision_at = now(), decided_by_user_id = auth.uid()
  WHERE id = _request_id;

  -- Add user to company
  INSERT INTO public.company_members (company_id, user_id, role)
  VALUES (req.company_id, req.user_id, _role)
  ON CONFLICT DO NOTHING;

  -- Approve the user profile (so they pass the approval check)
  UPDATE public.profiles
  SET approved_at = now(), approved_by = auth.uid()
  WHERE user_id = req.user_id AND approved_at IS NULL;
END;
$$;

-- Function to reject a join request
CREATE OR REPLACE FUNCTION public.reject_join_request(_request_id uuid, _rejection_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req RECORD;
BEGIN
  SELECT * INTO req FROM public.company_join_requests WHERE id = _request_id AND status = 'pending';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Join request not found or already processed';
  END IF;

  IF NOT (public.is_company_admin(auth.uid(), req.company_id) OR public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Only company admins can reject join requests';
  END IF;

  UPDATE public.company_join_requests
  SET status = 'rejected', decision_at = now(), decided_by_user_id = auth.uid(), rejection_note = _rejection_note
  WHERE id = _request_id;
END;
$$;

-- Function to get pending join requests for a company (admin view)
CREATE OR REPLACE FUNCTION public.get_company_join_requests(_company_id uuid, _status text DEFAULT 'pending')
RETURNS TABLE(
  id uuid,
  user_id uuid,
  user_email text,
  user_display_name text,
  user_avatar_url text,
  status text,
  note text,
  rejection_note text,
  created_at timestamptz,
  decision_at timestamptz,
  decided_by_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    cjr.id,
    cjr.user_id,
    p.email as user_email,
    p.display_name as user_display_name,
    p.avatar_url as user_avatar_url,
    cjr.status,
    cjr.note,
    cjr.rejection_note,
    cjr.created_at,
    cjr.decision_at,
    dp.display_name as decided_by_name
  FROM public.company_join_requests cjr
  JOIN public.profiles p ON p.user_id = cjr.user_id
  LEFT JOIN public.profiles dp ON dp.user_id = cjr.decided_by_user_id
  WHERE cjr.company_id = _company_id
    AND (_status IS NULL OR cjr.status = _status)
    AND (
      public.is_company_admin(auth.uid(), _company_id)
      OR public.is_admin(auth.uid())
    )
  ORDER BY cjr.created_at DESC;
$$;
