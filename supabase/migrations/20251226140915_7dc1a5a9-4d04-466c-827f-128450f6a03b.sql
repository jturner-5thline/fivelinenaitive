-- Create enum for company roles
CREATE TYPE public.company_role AS ENUM ('owner', 'admin', 'member');

-- Create companies table
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  logo_url TEXT,
  website_url TEXT,
  industry TEXT,
  employee_size TEXT,
  description TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create company_members table to track membership and roles
CREATE TABLE public.company_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role company_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id, user_id)
);

-- Enable RLS
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check company role
CREATE OR REPLACE FUNCTION public.get_user_company_role(_user_id UUID, _company_id UUID)
RETURNS company_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.company_members
  WHERE user_id = _user_id
    AND company_id = _company_id
  LIMIT 1
$$;

-- Create function to check if user is company admin or owner
CREATE OR REPLACE FUNCTION public.is_company_admin(_user_id UUID, _company_id UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members
    WHERE user_id = _user_id
      AND company_id = _company_id
      AND role IN ('owner', 'admin')
  )
$$;

-- Create function to get user's company ID
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id
  FROM public.company_members
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- RLS Policies for companies table
-- All company members can view their company
CREATE POLICY "Company members can view their company"
ON public.companies
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_members.company_id = companies.id
    AND company_members.user_id = auth.uid()
  )
);

-- Only admins and owners can update company
CREATE POLICY "Company admins can update company"
ON public.companies
FOR UPDATE
USING (public.is_company_admin(auth.uid(), id));

-- Only authenticated users can create a company (they become owner)
CREATE POLICY "Authenticated users can create company"
ON public.companies
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Only owners can delete company
CREATE POLICY "Company owners can delete company"
ON public.companies
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_members.company_id = companies.id
    AND company_members.user_id = auth.uid()
    AND company_members.role = 'owner'
  )
);

-- RLS Policies for company_members table
-- Members can view other members of their company
CREATE POLICY "Members can view company members"
ON public.company_members
FOR SELECT
USING (
  company_id = public.get_user_company_id(auth.uid())
);

-- Admins and owners can add members
CREATE POLICY "Admins can add members"
ON public.company_members
FOR INSERT
WITH CHECK (
  public.is_company_admin(auth.uid(), company_id)
  OR NOT EXISTS (SELECT 1 FROM public.company_members WHERE company_id = company_members.company_id)
);

-- Admins can update member roles (but not owner's role)
CREATE POLICY "Admins can update member roles"
ON public.company_members
FOR UPDATE
USING (
  public.is_company_admin(auth.uid(), company_id)
  AND role != 'owner'
);

-- Admins can remove members (but not owner)
CREATE POLICY "Admins can remove members"
ON public.company_members
FOR DELETE
USING (
  public.is_company_admin(auth.uid(), company_id)
  AND role != 'owner'
);

-- Create trigger for updated_at
CREATE TRIGGER update_companies_updated_at
BEFORE UPDATE ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_company_members_updated_at
BEFORE UPDATE ON public.company_members
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();