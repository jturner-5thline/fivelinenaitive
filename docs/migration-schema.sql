-- =============================================
-- NAITIVE DATABASE SCHEMA MIGRATION
-- Run this in your external Supabase SQL Editor
-- =============================================

-- =============================================
-- 1. ENUMS
-- =============================================
CREATE TYPE public.company_role AS ENUM ('owner', 'admin', 'member');

-- =============================================
-- 2. TABLES
-- =============================================

-- Companies
CREATE TABLE public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    name TEXT NOT NULL,
    logo_url TEXT,
    website_url TEXT,
    industry TEXT,
    employee_size TEXT,
    description TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    country TEXT
);

-- Company Members
CREATE TABLE public.company_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role company_role NOT NULL DEFAULT 'member',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(company_id, user_id)
);

-- Company Invitations
CREATE TABLE public.company_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role company_role NOT NULL DEFAULT 'member',
    invited_by UUID NOT NULL REFERENCES auth.users(id),
    token UUID NOT NULL DEFAULT gen_random_uuid(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    email_sent_at TIMESTAMPTZ,
    email_status TEXT DEFAULT 'pending',
    email_error TEXT
);

-- Profiles
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    display_name TEXT,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    avatar_url TEXT,
    phone TEXT,
    company_name TEXT,
    backup_email TEXT,
    company_url TEXT,
    company_size TEXT,
    company_role TEXT,
    onboarding_completed BOOLEAN NOT NULL DEFAULT false,
    email_notifications BOOLEAN NOT NULL DEFAULT true,
    in_app_notifications BOOLEAN NOT NULL DEFAULT true,
    deal_updates_email BOOLEAN NOT NULL DEFAULT true,
    deal_updates_app BOOLEAN NOT NULL DEFAULT true,
    lender_updates_email BOOLEAN NOT NULL DEFAULT true,
    lender_updates_app BOOLEAN NOT NULL DEFAULT true,
    weekly_summary_email BOOLEAN NOT NULL DEFAULT true,
    notify_stale_alerts BOOLEAN NOT NULL DEFAULT true,
    notify_activity_deal_created BOOLEAN NOT NULL DEFAULT true,
    notify_activity_lender_added BOOLEAN NOT NULL DEFAULT true,
    notify_activity_lender_updated BOOLEAN NOT NULL DEFAULT true,
    notify_activity_stage_changed BOOLEAN NOT NULL DEFAULT true,
    notify_activity_status_changed BOOLEAN NOT NULL DEFAULT true,
    notify_activity_milestone_added BOOLEAN NOT NULL DEFAULT true,
    notify_activity_milestone_completed BOOLEAN NOT NULL DEFAULT true,
    notify_activity_milestone_missed BOOLEAN NOT NULL DEFAULT true
);

-- Deals
CREATE TABLE public.deals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
    company TEXT NOT NULL,
    value NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    stage TEXT NOT NULL DEFAULT 'Initial Review',
    engagement_type TEXT,
    deal_type TEXT,
    referred_by TEXT,
    manager TEXT,
    exclusivity TEXT,
    deal_owner TEXT,
    notes TEXT,
    flag_notes TEXT,
    is_flagged BOOLEAN NOT NULL DEFAULT false,
    notes_updated_at TIMESTAMPTZ,
    migrated_from_personal BOOLEAN NOT NULL DEFAULT false,
    pre_signing_hours NUMERIC DEFAULT 0,
    post_signing_hours NUMERIC DEFAULT 0,
    total_fee NUMERIC DEFAULT 0,
    retainer_fee NUMERIC DEFAULT 0,
    milestone_fee NUMERIC DEFAULT 0,
    success_fee_percent NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deal Lenders
CREATE TABLE public.deal_lenders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    stage TEXT NOT NULL DEFAULT 'Initial Outreach',
    substage TEXT,
    notes TEXT,
    pass_reason TEXT,
    quote_amount NUMERIC,
    quote_rate NUMERIC,
    quote_term TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deal Milestones
CREATE TABLE public.deal_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    title TEXT NOT NULL,
    due_date TIMESTAMPTZ,
    completed BOOLEAN NOT NULL DEFAULT false,
    completed_at TIMESTAMPTZ,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deal Attachments
CREATE TABLE public.deal_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id),
    name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    category TEXT NOT NULL,
    content_type TEXT,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deal Status Notes
CREATE TABLE public.deal_status_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    note TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deal Flag Notes
CREATE TABLE public.deal_flag_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    note TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lender Notes History
CREATE TABLE public.lender_notes_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_lender_id UUID NOT NULL REFERENCES public.deal_lenders(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lender Attachments
CREATE TABLE public.lender_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lender_name TEXT NOT NULL,
    name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    content_type TEXT,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Activity Logs
CREATE TABLE public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    activity_type TEXT NOT NULL,
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Outstanding Items
CREATE TABLE public.outstanding_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
    lender_id UUID REFERENCES public.deal_lenders(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id),
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    notes TEXT,
    due_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Referral Sources
CREATE TABLE public.referral_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    company TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Workflows
CREATE TABLE public.workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    trigger_type TEXT NOT NULL,
    trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    actions JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Workflow Runs
CREATE TABLE public.workflow_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    trigger_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    results JSONB NOT NULL DEFAULT '[]'::jsonb,
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

-- Notification Reads
CREATE TABLE public.notification_reads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    notification_type TEXT NOT NULL,
    notification_id TEXT NOT NULL,
    read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, notification_type, notification_id)
);

-- Login History
CREATE TABLE public.login_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    ip_address TEXT,
    user_agent TEXT,
    browser TEXT,
    os TEXT,
    device_type TEXT DEFAULT 'desktop',
    city TEXT,
    country TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Waitlist
CREATE TABLE public.waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    company TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- 3. DATABASE FUNCTIONS
-- =============================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id
  FROM public.company_members
  WHERE user_id = _user_id
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_user_company_role(_user_id uuid, _company_id uuid)
RETURNS company_role
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.company_members
  WHERE user_id = _user_id
    AND company_id = _company_id
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_company_member(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members
    WHERE user_id = _user_id
      AND company_id = _company_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_company_admin(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
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

CREATE OR REPLACE FUNCTION public.is_same_company_as_user(_current_user_id uuid, _deal_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members cm1
    JOIN public.company_members cm2 ON cm1.company_id = cm2.company_id
    WHERE cm1.user_id = _current_user_id
      AND cm2.user_id = _deal_owner_id
  )
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clean_name TEXT;
  first TEXT;
  last TEXT;
  avatar TEXT;
BEGIN
  first := COALESCE(
    TRIM(new.raw_user_meta_data ->> 'given_name'),
    TRIM(new.raw_user_meta_data ->> 'first_name'),
    SPLIT_PART(COALESCE(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), ' ', 1)
  );
  
  last := COALESCE(
    TRIM(new.raw_user_meta_data ->> 'family_name'),
    TRIM(new.raw_user_meta_data ->> 'last_name'),
    NULLIF(TRIM(SUBSTRING(
      COALESCE(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
      LENGTH(SPLIT_PART(COALESCE(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), ' ', 1)) + 2
    )), '')
  );
  
  avatar := COALESCE(
    new.raw_user_meta_data ->> 'picture',
    new.raw_user_meta_data ->> 'avatar_url'
  );
  
  clean_name := COALESCE(
    NULLIF(TRIM(CONCAT(first, ' ', last)), ''),
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'display_name',
    SPLIT_PART(new.email, '@', 1)
  );
  
  IF clean_name = '' OR clean_name IS NULL THEN
    clean_name := SPLIT_PART(new.email, '@', 1);
  END IF;
  
  clean_name := SUBSTRING(clean_name, 1, 100);
  first := SUBSTRING(first, 1, 50);
  last := SUBSTRING(last, 1, 50);
  
  INSERT INTO public.profiles (user_id, display_name, first_name, last_name, avatar_url, email)
  VALUES (new.id, clean_name, NULLIF(first, ''), NULLIF(last, ''), avatar, new.email);
  
  RETURN new;
END;
$$;

-- =============================================
-- 4. TRIGGERS
-- =============================================

-- Updated at triggers
CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_company_members_updated_at
  BEFORE UPDATE ON public.company_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_deals_updated_at
  BEFORE UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_deal_lenders_updated_at
  BEFORE UPDATE ON public.deal_lenders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_deal_milestones_updated_at
  BEFORE UPDATE ON public.deal_milestones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_outstanding_items_updated_at
  BEFORE UPDATE ON public.outstanding_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_referral_sources_updated_at
  BEFORE UPDATE ON public.referral_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_workflows_updated_at
  BEFORE UPDATE ON public.workflows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- New user trigger (create after auth.users exists)
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- 5. ENABLE ROW LEVEL SECURITY
-- =============================================

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_lenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_status_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_flag_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lender_notes_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lender_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outstanding_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 6. RLS POLICIES
-- =============================================

-- COMPANIES
CREATE POLICY "Require authentication for companies" ON public.companies FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Company members can view their company" ON public.companies FOR SELECT USING (EXISTS (SELECT 1 FROM company_members WHERE company_id = companies.id AND user_id = auth.uid()));
CREATE POLICY "Authenticated users can create company" ON public.companies FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Company admins can update company" ON public.companies FOR UPDATE USING (is_company_admin(auth.uid(), id));
CREATE POLICY "Company owners can delete company" ON public.companies FOR DELETE USING (EXISTS (SELECT 1 FROM company_members WHERE company_id = companies.id AND user_id = auth.uid() AND role = 'owner'));

-- COMPANY MEMBERS
CREATE POLICY "Require authentication for company_members" ON public.company_members FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Members can view company members" ON public.company_members FOR SELECT USING (company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Members can be added by admins or via invitation" ON public.company_members FOR INSERT WITH CHECK (
  is_company_admin(auth.uid(), company_id) 
  OR ((user_id = auth.uid()) AND (EXISTS (SELECT 1 FROM company_invitations ci WHERE ci.company_id = company_members.company_id AND ci.accepted_at IS NULL AND ci.expires_at > now() AND ((lower(ci.email) = lower(COALESCE((auth.jwt() ->> 'email'), ''))) OR (ci.email ~~ 'link-invite-%@placeholder.local')))))
  OR ((user_id = auth.uid()) AND (NOT (EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = company_members.company_id))))
);
CREATE POLICY "Admins can update member roles" ON public.company_members FOR UPDATE USING (is_company_admin(auth.uid(), company_id) AND role <> 'owner');
CREATE POLICY "Admins can remove members" ON public.company_members FOR DELETE USING (is_company_admin(auth.uid(), company_id) AND role <> 'owner');

-- COMPANY INVITATIONS
CREATE POLICY "Require authentication for company_invitations" ON public.company_invitations FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can view invitations" ON public.company_invitations FOR SELECT USING (is_company_admin(auth.uid(), company_id));
CREATE POLICY "Users can view invitations sent to their email" ON public.company_invitations FOR SELECT USING (auth.uid() IS NOT NULL AND lower(email) = lower(COALESCE((auth.jwt() ->> 'email'), '')));
CREATE POLICY "Members can create invitations" ON public.company_invitations FOR INSERT WITH CHECK (is_company_member(auth.uid(), company_id));
CREATE POLICY "Users can accept invitations" ON public.company_invitations FOR UPDATE USING (auth.uid() IS NOT NULL AND accepted_at IS NULL AND ((lower(email) = lower(COALESCE((auth.jwt() ->> 'email'), ''))) OR (email ~~ 'link-invite-%@placeholder.local'))) WITH CHECK (auth.uid() IS NOT NULL AND ((lower(email) = lower(COALESCE((auth.jwt() ->> 'email'), ''))) OR (email ~~ 'link-invite-%@placeholder.local')));
CREATE POLICY "Admins can delete invitations" ON public.company_invitations FOR DELETE USING (is_company_admin(auth.uid(), company_id));

-- PROFILES
CREATE POLICY "Require authentication for profiles" ON public.profiles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Company members can view teammate profiles" ON public.profiles FOR SELECT USING (EXISTS (SELECT 1 FROM company_members cm1 JOIN company_members cm2 ON cm1.company_id = cm2.company_id WHERE cm1.user_id = auth.uid() AND cm2.user_id = profiles.user_id));
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- DEALS
CREATE POLICY "Require authentication for deals" ON public.deals FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can view deals" ON public.deals FOR SELECT USING (
  CASE WHEN get_user_company_id(auth.uid()) IS NOT NULL 
  THEN (company_id = get_user_company_id(auth.uid()) OR is_same_company_as_user(auth.uid(), user_id))
  ELSE auth.uid() = user_id END
);
CREATE POLICY "Users can create deals" ON public.deals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update deals" ON public.deals FOR UPDATE USING (
  CASE WHEN get_user_company_id(auth.uid()) IS NOT NULL 
  THEN (company_id = get_user_company_id(auth.uid()) OR is_same_company_as_user(auth.uid(), user_id))
  ELSE auth.uid() = user_id END
);
CREATE POLICY "Users can delete deals" ON public.deals FOR DELETE USING (
  CASE WHEN get_user_company_id(auth.uid()) IS NOT NULL 
  THEN (is_company_admin(auth.uid(), get_user_company_id(auth.uid())) AND (company_id = get_user_company_id(auth.uid()) OR is_same_company_as_user(auth.uid(), user_id)))
  ELSE auth.uid() = user_id END
);

-- DEAL LENDERS
CREATE POLICY "Require authentication for deal_lenders" ON public.deal_lenders FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can view lenders of their deals" ON public.deal_lenders FOR SELECT USING (EXISTS (SELECT 1 FROM deals WHERE deals.id = deal_lenders.deal_id AND (deals.user_id = auth.uid() OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id)))));
CREATE POLICY "Users can create lenders for their deals" ON public.deal_lenders FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM deals WHERE deals.id = deal_lenders.deal_id AND (deals.user_id = auth.uid() OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id)))));
CREATE POLICY "Users can update lenders of their deals" ON public.deal_lenders FOR UPDATE USING (EXISTS (SELECT 1 FROM deals WHERE deals.id = deal_lenders.deal_id AND (deals.user_id = auth.uid() OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id)))));
CREATE POLICY "Users can delete lenders of their deals" ON public.deal_lenders FOR DELETE USING (EXISTS (SELECT 1 FROM deals WHERE deals.id = deal_lenders.deal_id AND (deals.user_id = auth.uid() OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id)))));

-- DEAL MILESTONES
CREATE POLICY "Require authentication for deal_milestones" ON public.deal_milestones FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can view milestones for their deals" ON public.deal_milestones FOR SELECT USING (EXISTS (SELECT 1 FROM deals WHERE deals.id = deal_milestones.deal_id AND (deals.user_id = auth.uid() OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id)))));
CREATE POLICY "Users can create milestones for their deals" ON public.deal_milestones FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM deals WHERE deals.id = deal_milestones.deal_id AND (deals.user_id = auth.uid() OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id)))));
CREATE POLICY "Users can update milestones for their deals" ON public.deal_milestones FOR UPDATE USING (EXISTS (SELECT 1 FROM deals WHERE deals.id = deal_milestones.deal_id AND (deals.user_id = auth.uid() OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id)))));
CREATE POLICY "Users can delete milestones for their deals" ON public.deal_milestones FOR DELETE USING (EXISTS (SELECT 1 FROM deals WHERE deals.id = deal_milestones.deal_id AND (deals.user_id = auth.uid() OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id)))));

-- DEAL ATTACHMENTS
CREATE POLICY "Require authentication for deal_attachments" ON public.deal_attachments FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can view attachments for their deals" ON public.deal_attachments FOR SELECT USING (EXISTS (SELECT 1 FROM deals WHERE deals.id::text = deal_attachments.deal_id AND (deals.user_id = auth.uid() OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id)))));
CREATE POLICY "Users can upload attachments for their deals" ON public.deal_attachments FOR INSERT WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM deals WHERE deals.id::text = deal_attachments.deal_id AND (deals.user_id = auth.uid() OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id)))));
CREATE POLICY "Users can delete attachments for their deals" ON public.deal_attachments FOR DELETE USING (EXISTS (SELECT 1 FROM deals WHERE deals.id::text = deal_attachments.deal_id AND (deals.user_id = auth.uid() OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id)))));

-- DEAL STATUS NOTES
CREATE POLICY "Require authentication for deal_status_notes" ON public.deal_status_notes FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can view status notes for their deals" ON public.deal_status_notes FOR SELECT USING (EXISTS (SELECT 1 FROM deals WHERE deals.id = deal_status_notes.deal_id AND (deals.user_id = auth.uid() OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id)))));
CREATE POLICY "Users can create status notes for their deals" ON public.deal_status_notes FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM deals WHERE deals.id = deal_status_notes.deal_id AND (deals.user_id = auth.uid() OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id)))));
CREATE POLICY "Users can delete status notes for their deals" ON public.deal_status_notes FOR DELETE USING (EXISTS (SELECT 1 FROM deals WHERE deals.id = deal_status_notes.deal_id AND (deals.user_id = auth.uid() OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id)))));

-- DEAL FLAG NOTES
CREATE POLICY "Require authentication for deal_flag_notes" ON public.deal_flag_notes FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can view flag notes for their deals" ON public.deal_flag_notes FOR SELECT USING (EXISTS (SELECT 1 FROM deals d WHERE d.id = deal_flag_notes.deal_id AND (d.user_id = auth.uid() OR (d.company_id IS NOT NULL AND d.company_id = get_user_company_id(auth.uid())))));
CREATE POLICY "Users can create flag notes for their deals" ON public.deal_flag_notes FOR INSERT WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM deals d WHERE d.id = deal_flag_notes.deal_id AND (d.user_id = auth.uid() OR (d.company_id IS NOT NULL AND d.company_id = get_user_company_id(auth.uid())))));
CREATE POLICY "Users can delete flag notes for their deals" ON public.deal_flag_notes FOR DELETE USING (EXISTS (SELECT 1 FROM deals d WHERE d.id = deal_flag_notes.deal_id AND (d.user_id = auth.uid() OR (d.company_id IS NOT NULL AND d.company_id = get_user_company_id(auth.uid())))));

-- LENDER NOTES HISTORY
CREATE POLICY "Require authentication for lender_notes_history" ON public.lender_notes_history FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can view notes history for their deal lenders" ON public.lender_notes_history FOR SELECT USING (EXISTS (SELECT 1 FROM deal_lenders dl JOIN deals d ON d.id = dl.deal_id WHERE dl.id = lender_notes_history.deal_lender_id AND d.user_id = auth.uid()));
CREATE POLICY "Users can create notes history for their deal lenders" ON public.lender_notes_history FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM deal_lenders dl JOIN deals d ON d.id = dl.deal_id WHERE dl.id = lender_notes_history.deal_lender_id AND d.user_id = auth.uid()));
CREATE POLICY "Users can delete notes history for their deal lenders" ON public.lender_notes_history FOR DELETE USING (EXISTS (SELECT 1 FROM deal_lenders dl JOIN deals d ON d.id = dl.deal_id WHERE dl.id = lender_notes_history.deal_lender_id AND d.user_id = auth.uid()));

-- LENDER ATTACHMENTS
CREATE POLICY "Require authentication for lender_attachments" ON public.lender_attachments FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can view their own lender attachments" ON public.lender_attachments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can upload their own lender attachments" ON public.lender_attachments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own lender attachments" ON public.lender_attachments FOR DELETE USING (auth.uid() = user_id);

-- ACTIVITY LOGS
CREATE POLICY "Require authentication for activity_logs" ON public.activity_logs FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can view activity for their deals" ON public.activity_logs FOR SELECT USING (EXISTS (SELECT 1 FROM deals WHERE deals.id = activity_logs.deal_id AND (deals.user_id = auth.uid() OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id)))));
CREATE POLICY "Users can create activity for their deals" ON public.activity_logs FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM deals WHERE deals.id = activity_logs.deal_id AND (deals.user_id = auth.uid() OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id)))));

-- OUTSTANDING ITEMS
CREATE POLICY "Require authentication for outstanding_items" ON public.outstanding_items FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can view their own outstanding_items" ON public.outstanding_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own outstanding_items" ON public.outstanding_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own outstanding_items" ON public.outstanding_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own outstanding_items" ON public.outstanding_items FOR DELETE USING (auth.uid() = user_id);

-- REFERRAL SOURCES
CREATE POLICY "Require authentication for referral_sources" ON public.referral_sources FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can view their own referral sources" ON public.referral_sources FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own referral sources" ON public.referral_sources FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own referral sources" ON public.referral_sources FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own referral sources" ON public.referral_sources FOR DELETE USING (auth.uid() = user_id);

-- WORKFLOWS
CREATE POLICY "Require authentication for workflows" ON public.workflows FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can view their own workflows" ON public.workflows FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own workflows" ON public.workflows FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own workflows" ON public.workflows FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own workflows" ON public.workflows FOR DELETE USING (auth.uid() = user_id);

-- WORKFLOW RUNS
CREATE POLICY "Require authentication for workflow_runs" ON public.workflow_runs FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can view their own workflow runs" ON public.workflow_runs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own workflow runs" ON public.workflow_runs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own workflow runs" ON public.workflow_runs FOR UPDATE USING (auth.uid() = user_id);

-- NOTIFICATION READS
CREATE POLICY "Require authentication for notification_reads" ON public.notification_reads FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can view their own notification reads" ON public.notification_reads FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can mark notifications as read" ON public.notification_reads FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own notification reads" ON public.notification_reads FOR DELETE USING (auth.uid() = user_id);

-- LOGIN HISTORY
CREATE POLICY "Require authentication for login_history" ON public.login_history FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can view their own login history" ON public.login_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own login history" ON public.login_history FOR INSERT WITH CHECK (auth.uid() = user_id);

-- WAITLIST
CREATE POLICY "Anyone can join waitlist" ON public.waitlist FOR INSERT WITH CHECK (true);
CREATE POLICY "Only admins can view waitlist" ON public.waitlist FOR SELECT USING (auth.uid() IS NOT NULL);

-- =============================================
-- 7. STORAGE BUCKETS
-- =============================================

INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('company-logos', 'company-logos', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('deal-attachments', 'deal-attachments', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('lender-attachments', 'lender-attachments', false);

-- Storage policies (you'll need to add these based on your needs)
CREATE POLICY "Users can upload avatars" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can view avatars" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Users can update their avatars" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete their avatars" ON storage.objects FOR DELETE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Anyone can view company logos" ON storage.objects FOR SELECT USING (bucket_id = 'company-logos');
CREATE POLICY "Authenticated users can upload company logos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'company-logos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can manage deal attachments" ON storage.objects FOR ALL USING (bucket_id = 'deal-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can manage lender attachments" ON storage.objects FOR ALL USING (bucket_id = 'lender-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

-- =============================================
-- 8. REALTIME (if needed)
-- =============================================

-- Uncomment if you want realtime on specific tables:
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.deals;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.deal_lenders;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;

-- =============================================
-- MIGRATION COMPLETE
-- =============================================
