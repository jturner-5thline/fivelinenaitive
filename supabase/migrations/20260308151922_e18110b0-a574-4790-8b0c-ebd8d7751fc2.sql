
-- Company type enum
CREATE TYPE public.crm_company_type AS ENUM (
  'customer', 'prospect', 'partner', 'vendor', 'internal', 'other'
);

-- Company status enum
CREATE TYPE public.crm_company_status AS ENUM (
  'active', 'inactive', 'target', 'churned'
);

-- Company lifecycle stage enum
CREATE TYPE public.crm_company_lifecycle AS ENUM (
  'target', 'engaged', 'opportunity', 'customer', 'expansion', 'churn_risk'
);

-- CRM Companies table (B2B accounts, distinct from internal org companies table)
CREATE TABLE public.crm_companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Core identity
  name TEXT NOT NULL,
  domain TEXT,
  additional_domains TEXT[] DEFAULT '{}',
  logo_url TEXT,
  company_type crm_company_type DEFAULT 'prospect',
  status crm_company_status DEFAULT 'active',

  -- Ownership
  owner_user_id UUID,

  -- Firmographics
  industry TEXT,
  sub_industry TEXT,
  employee_count INTEGER,
  employee_range TEXT,
  annual_revenue NUMERIC,
  revenue_band TEXT,
  hq_city TEXT,
  hq_state TEXT,
  hq_country TEXT,
  hq_postal_code TEXT,
  regions_served TEXT[] DEFAULT '{}',

  -- Hierarchy
  parent_company_id UUID REFERENCES public.crm_companies(id) ON DELETE SET NULL,

  -- Relationship
  customer_tier TEXT,
  segment TEXT,
  lifecycle_stage crm_company_lifecycle DEFAULT 'target',

  -- Commercial
  arr NUMERIC,
  mrr NUMERIC,
  total_contract_value NUMERIC,
  recent_deal_amount NUMERIC,
  recent_deal_close_date DATE,
  contract_start_date DATE,
  contract_end_date DATE,
  renewal_date DATE,
  key_products TEXT[] DEFAULT '{}',

  -- Operational
  description TEXT,
  website_url TEXT,
  linkedin_url TEXT,
  twitter_url TEXT,
  phone TEXT,
  main_contact_email TEXT,
  tags TEXT[] DEFAULT '{}',

  -- Activity tracking
  last_activity_date TIMESTAMPTZ,
  next_activity_date TIMESTAMPTZ,

  -- Integration / HubSpot
  hubspot_company_id TEXT,
  external_ids JSONB DEFAULT '{}',
  source_system TEXT DEFAULT 'native',
  migrated_from_hubspot BOOLEAN DEFAULT false,
  synced_with_hubspot BOOLEAN DEFAULT false,

  -- Custom fields
  custom_fields JSONB DEFAULT '{}',

  -- System
  created_by UUID,
  last_modified_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Org scoping (which naitive org owns this CRM record)
  org_company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_crm_companies_org ON public.crm_companies(org_company_id);
CREATE INDEX idx_crm_companies_domain ON public.crm_companies(domain);
CREATE INDEX idx_crm_companies_hubspot_id ON public.crm_companies(hubspot_company_id);
CREATE INDEX idx_crm_companies_lifecycle ON public.crm_companies(lifecycle_stage);
CREATE INDEX idx_crm_companies_status ON public.crm_companies(status);
CREATE INDEX idx_crm_companies_owner ON public.crm_companies(owner_user_id);
CREATE INDEX idx_crm_companies_parent ON public.crm_companies(parent_company_id);
CREATE INDEX idx_crm_companies_renewal ON public.crm_companies(renewal_date);
CREATE INDEX idx_crm_companies_segment ON public.crm_companies(segment);
CREATE INDEX idx_crm_companies_arr ON public.crm_companies(arr DESC NULLS LAST);
CREATE INDEX idx_crm_companies_fulltext ON public.crm_companies USING gin(
  to_tsvector('simple', COALESCE(name,'') || ' ' || COALESCE(domain,'') || ' ' || COALESCE(industry,''))
);

-- Updated at trigger
CREATE TRIGGER update_crm_companies_updated_at
  BEFORE UPDATE ON public.crm_companies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-set org_company_id
CREATE OR REPLACE FUNCTION public.set_crm_company_org()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.org_company_id IS NULL AND NEW.created_by IS NOT NULL THEN
    NEW.org_company_id := public.get_user_company_id(NEW.created_by);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_crm_company_org_trigger
  BEFORE INSERT ON public.crm_companies
  FOR EACH ROW
  EXECUTE FUNCTION public.set_crm_company_org();

-- RLS
ALTER TABLE public.crm_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view crm_companies"
  ON public.crm_companies FOR SELECT
  TO authenticated
  USING (
    public.is_5thline_user(auth.uid())
    OR org_company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Company members can insert crm_companies"
  ON public.crm_companies FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_5thline_user(auth.uid())
    OR org_company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
    OR org_company_id IS NULL
  );

CREATE POLICY "Company members can update crm_companies"
  ON public.crm_companies FOR UPDATE
  TO authenticated
  USING (
    public.is_5thline_user(auth.uid())
    OR org_company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Company members can delete crm_companies"
  ON public.crm_companies FOR DELETE
  TO authenticated
  USING (
    public.is_5thline_user(auth.uid())
    OR org_company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

-- CRM Company account team members
CREATE TABLE public.crm_company_team (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  crm_company_id UUID NOT NULL REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(crm_company_id, user_id)
);

ALTER TABLE public.crm_company_team ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can manage crm company team"
  ON public.crm_company_team FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.crm_companies cc
      JOIN public.company_members cm ON cm.company_id = cc.org_company_id
      WHERE cc.id = crm_company_id AND cm.user_id = auth.uid()
    )
    OR public.is_5thline_user(auth.uid())
  );

-- CRM Company activities
CREATE TABLE public.crm_company_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  crm_company_id UUID NOT NULL REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  logged_by UUID,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  source TEXT DEFAULT 'native',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_company_activities_company ON public.crm_company_activities(crm_company_id);
CREATE INDEX idx_crm_company_activities_occurred ON public.crm_company_activities(occurred_at DESC);

ALTER TABLE public.crm_company_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can manage crm company activities"
  ON public.crm_company_activities FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.crm_companies cc
      JOIN public.company_members cm ON cm.company_id = cc.org_company_id
      WHERE cc.id = crm_company_id AND cm.user_id = auth.uid()
    )
    OR public.is_5thline_user(auth.uid())
  );

-- Add crm_company_id FK to contacts for CRM relationship
ALTER TABLE public.contacts ADD COLUMN crm_company_id UUID REFERENCES public.crm_companies(id) ON DELETE SET NULL;
CREATE INDEX idx_contacts_crm_company ON public.contacts(crm_company_id);
