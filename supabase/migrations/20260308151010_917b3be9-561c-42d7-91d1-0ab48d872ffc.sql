
-- Contact lifecycle stage enum
CREATE TYPE public.contact_lifecycle_stage AS ENUM (
  'subscriber', 'lead', 'mql', 'sql', 'opportunity', 'customer', 'evangelist', 'other'
);

-- Contact status/disposition enum
CREATE TYPE public.contact_status AS ENUM (
  'new', 'working', 'meeting_scheduled', 'no_show', 'no_fit', 'nurture', 'bad_data', 'converted', 'closed'
);

-- Contact buying role enum
CREATE TYPE public.contact_buying_role AS ENUM (
  'economic_buyer', 'champion', 'influencer', 'user', 'blocker', 'legal', 'finance', 'other'
);

-- Contacts table
CREATE TABLE public.contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  
  -- Core identity
  first_name TEXT,
  last_name TEXT,
  full_name TEXT GENERATED ALWAYS AS (TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))) STORED,
  email TEXT,
  additional_emails TEXT[] DEFAULT '{}',
  phone_work TEXT,
  phone_mobile TEXT,
  phone_other TEXT,
  job_title TEXT,
  department TEXT,
  seniority TEXT,
  timezone TEXT,
  locale TEXT,
  
  -- Lifecycle
  lifecycle_stage contact_lifecycle_stage DEFAULT 'lead',
  status contact_status DEFAULT 'new',
  buying_role contact_buying_role,
  
  -- Scores
  contact_score NUMERIC DEFAULT 0,
  behavioral_score NUMERIC DEFAULT 0,
  fit_score NUMERIC DEFAULT 0,
  
  -- Ownership
  owner_user_id UUID,
  sdr_owner_id UUID,
  ae_owner_id UUID,
  
  -- Primary company association
  primary_company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  
  -- Lead source / campaign
  lead_source TEXT,
  lead_source_original TEXT,
  lead_source_latest TEXT,
  campaign TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  
  -- Activity dates
  last_activity_date TIMESTAMPTZ,
  last_outbound_touch_date TIMESTAMPTZ,
  last_inbound_activity_date TIMESTAMPTZ,
  next_activity_date TIMESTAMPTZ,
  
  -- Communication preferences
  preferred_channel TEXT DEFAULT 'email',
  email_opt_in BOOLEAN DEFAULT true,
  phone_opt_in BOOLEAN DEFAULT true,
  sms_opt_in BOOLEAN DEFAULT true,
  
  -- Social / web
  linkedin_url TEXT,
  website_url TEXT,
  
  -- Notes
  description TEXT,
  
  -- HubSpot & integration
  hubspot_contact_id TEXT,
  external_ids JSONB DEFAULT '{}',
  source_system TEXT DEFAULT 'native',
  migrated_from_hubspot BOOLEAN DEFAULT false,
  synced_with_hubspot BOOLEAN DEFAULT false,
  
  -- Custom fields
  custom_fields JSONB DEFAULT '{}',
  
  -- Tags
  tags TEXT[] DEFAULT '{}',
  
  -- System
  created_by UUID,
  last_modified_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Organization scoping
  org_company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_contacts_org_company ON public.contacts(org_company_id);
CREATE INDEX idx_contacts_email ON public.contacts(email);
CREATE INDEX idx_contacts_hubspot_id ON public.contacts(hubspot_contact_id);
CREATE INDEX idx_contacts_lifecycle ON public.contacts(lifecycle_stage);
CREATE INDEX idx_contacts_status ON public.contacts(status);
CREATE INDEX idx_contacts_owner ON public.contacts(owner_user_id);
CREATE INDEX idx_contacts_sdr ON public.contacts(sdr_owner_id);
CREATE INDEX idx_contacts_ae ON public.contacts(ae_owner_id);
CREATE INDEX idx_contacts_primary_company ON public.contacts(primary_company_id);
CREATE INDEX idx_contacts_last_activity ON public.contacts(last_activity_date);
CREATE INDEX idx_contacts_score ON public.contacts(contact_score DESC);
CREATE INDEX idx_contacts_fulltext ON public.contacts USING gin(
  to_tsvector('simple', COALESCE(first_name,'') || ' ' || COALESCE(last_name,'') || ' ' || COALESCE(email,'') || ' ' || COALESCE(job_title,''))
);

-- Updated at trigger
CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-set org_company_id from user
CREATE OR REPLACE FUNCTION public.set_contact_org_company()
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

CREATE TRIGGER set_contact_org_company_trigger
  BEFORE INSERT ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_contact_org_company();

-- RLS
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- Company members can see contacts belonging to their org
CREATE POLICY "Company members can view contacts"
  ON public.contacts FOR SELECT
  TO authenticated
  USING (
    public.is_5thline_user(auth.uid())
    OR org_company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Company members can insert contacts"
  ON public.contacts FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_5thline_user(auth.uid())
    OR org_company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
    OR org_company_id IS NULL
  );

CREATE POLICY "Company members can update contacts"
  ON public.contacts FOR UPDATE
  TO authenticated
  USING (
    public.is_5thline_user(auth.uid())
    OR org_company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Company members can delete contacts"
  ON public.contacts FOR DELETE
  TO authenticated
  USING (
    public.is_5thline_user(auth.uid())
    OR org_company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

-- Contact company associations (for multiple company relationships)
CREATE TABLE public.contact_company_associations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  association_type TEXT DEFAULT 'employee',
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(contact_id, company_id)
);

ALTER TABLE public.contact_company_associations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can manage contact associations"
  ON public.contact_company_associations FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contacts c
      JOIN public.company_members cm ON cm.company_id = c.org_company_id
      WHERE c.id = contact_id AND cm.user_id = auth.uid()
    )
    OR public.is_5thline_user(auth.uid())
  );

-- Contact activities table
CREATE TABLE public.contact_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  logged_by UUID,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  source TEXT DEFAULT 'native',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contact_activities_contact ON public.contact_activities(contact_id);
CREATE INDEX idx_contact_activities_type ON public.contact_activities(activity_type);
CREATE INDEX idx_contact_activities_occurred ON public.contact_activities(occurred_at DESC);

ALTER TABLE public.contact_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can manage contact activities"
  ON public.contact_activities FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contacts c
      JOIN public.company_members cm ON cm.company_id = c.org_company_id
      WHERE c.id = contact_id AND cm.user_id = auth.uid()
    )
    OR public.is_5thline_user(auth.uid())
  );

-- Contact-deal associations
CREATE TABLE public.contact_deals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(contact_id, deal_id)
);

ALTER TABLE public.contact_deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can manage contact deals"
  ON public.contact_deals FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contacts c
      JOIN public.company_members cm ON cm.company_id = c.org_company_id
      WHERE c.id = contact_id AND cm.user_id = auth.uid()
    )
    OR public.is_5thline_user(auth.uid())
  );
