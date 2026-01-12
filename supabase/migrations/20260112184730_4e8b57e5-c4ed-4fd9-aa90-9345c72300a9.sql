-- Create enum for app roles
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles (prevents recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create helper function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
$$;

-- RLS policies for user_roles table
CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Create admin views for all users and companies (security definer functions)
CREATE OR REPLACE FUNCTION public.admin_get_all_profiles()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  email text,
  display_name text,
  first_name text,
  last_name text,
  avatar_url text,
  created_at timestamp with time zone,
  onboarding_completed boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.user_id, p.email, p.display_name, p.first_name, p.last_name, 
         p.avatar_url, p.created_at, p.onboarding_completed
  FROM public.profiles p
  WHERE public.is_admin(auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.admin_get_all_companies()
RETURNS TABLE (
  id uuid,
  name text,
  logo_url text,
  website_url text,
  industry text,
  employee_size text,
  created_at timestamp with time zone,
  member_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.logo_url, c.website_url, c.industry, c.employee_size, c.created_at,
         (SELECT COUNT(*) FROM public.company_members cm WHERE cm.company_id = c.id) as member_count
  FROM public.companies c
  WHERE public.is_admin(auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.admin_get_all_invitations()
RETURNS TABLE (
  id uuid,
  company_id uuid,
  company_name text,
  email text,
  role company_role,
  created_at timestamp with time zone,
  expires_at timestamp with time zone,
  accepted_at timestamp with time zone,
  email_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ci.id, ci.company_id, c.name as company_name, ci.email, ci.role, 
         ci.created_at, ci.expires_at, ci.accepted_at, ci.email_status
  FROM public.company_invitations ci
  JOIN public.companies c ON c.id = ci.company_id
  WHERE public.is_admin(auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.admin_get_system_stats()
RETURNS TABLE (
  total_users bigint,
  total_companies bigint,
  total_deals bigint,
  total_lenders bigint,
  active_deals bigint,
  waitlist_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    (SELECT COUNT(*) FROM public.profiles) as total_users,
    (SELECT COUNT(*) FROM public.companies) as total_companies,
    (SELECT COUNT(*) FROM public.deals) as total_deals,
    (SELECT COUNT(*) FROM public.deal_lenders) as total_lenders,
    (SELECT COUNT(*) FROM public.deals WHERE status = 'active') as active_deals,
    (SELECT COUNT(*) FROM public.waitlist) as waitlist_count
  WHERE public.is_admin(auth.uid())
$$;

-- Allow admins to manage waitlist
CREATE POLICY "Admins can delete waitlist entries"
ON public.waitlist
FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update waitlist entries"
ON public.waitlist
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()));