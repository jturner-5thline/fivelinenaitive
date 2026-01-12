-- Create tables for external project data (keeps them separate from local data)

CREATE TABLE public.external_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  external_id UUID NOT NULL,
  source_project_id TEXT NOT NULL,
  user_id UUID,
  email TEXT,
  display_name TEXT,
  first_name TEXT,
  last_name TEXT,
  avatar_url TEXT,
  onboarding_completed BOOLEAN DEFAULT false,
  external_created_at TIMESTAMP WITH TIME ZONE,
  synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(source_project_id, external_id)
);

CREATE TABLE public.external_deals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  external_id UUID NOT NULL,
  source_project_id TEXT NOT NULL,
  user_id UUID,
  company_id UUID,
  company TEXT,
  value NUMERIC,
  stage TEXT,
  status TEXT,
  deal_type TEXT,
  borrower_name TEXT,
  property_address TEXT,
  notes TEXT,
  external_created_at TIMESTAMP WITH TIME ZONE,
  external_updated_at TIMESTAMP WITH TIME ZONE,
  synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(source_project_id, external_id)
);

CREATE TABLE public.external_deal_lenders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  external_id UUID NOT NULL,
  source_project_id TEXT NOT NULL,
  deal_id UUID,
  external_deal_id UUID,
  name TEXT,
  stage TEXT,
  substage TEXT,
  status TEXT,
  notes TEXT,
  external_created_at TIMESTAMP WITH TIME ZONE,
  external_updated_at TIMESTAMP WITH TIME ZONE,
  synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(source_project_id, external_id)
);

CREATE TABLE public.external_activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  external_id UUID NOT NULL,
  source_project_id TEXT NOT NULL,
  deal_id UUID,
  external_deal_id UUID,
  user_id UUID,
  activity_type TEXT,
  description TEXT,
  metadata JSONB,
  external_created_at TIMESTAMP WITH TIME ZONE,
  synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(source_project_id, external_id)
);

-- Enable RLS on all external tables
ALTER TABLE public.external_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_deal_lenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_activity_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view external data
CREATE POLICY "Admins can view external profiles"
  ON public.external_profiles FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can view external deals"
  ON public.external_deals FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can view external lenders"
  ON public.external_deal_lenders FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can view external activity"
  ON public.external_activity_logs FOR SELECT
  USING (public.is_admin(auth.uid()));

-- Create indexes for efficient querying
CREATE INDEX idx_external_profiles_source ON public.external_profiles(source_project_id);
CREATE INDEX idx_external_deals_source ON public.external_deals(source_project_id);
CREATE INDEX idx_external_lenders_source ON public.external_deal_lenders(source_project_id);
CREATE INDEX idx_external_activity_source ON public.external_activity_logs(source_project_id);
CREATE INDEX idx_external_activity_created ON public.external_activity_logs(external_created_at DESC);