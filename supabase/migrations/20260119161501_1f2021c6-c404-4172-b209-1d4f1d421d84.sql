-- Create enum for data access scopes
CREATE TYPE public.data_access_scope AS ENUM (
  'all',           -- Can see all company data
  'team',          -- Can see team/assigned data only
  'own',           -- Can see only own data
  'none'           -- No access
);

-- Create user data permissions table
CREATE TABLE public.user_data_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  -- Data scope permissions
  deals_scope data_access_scope NOT NULL DEFAULT 'own',
  lenders_scope data_access_scope NOT NULL DEFAULT 'all',
  analytics_scope data_access_scope NOT NULL DEFAULT 'own',
  reports_scope data_access_scope NOT NULL DEFAULT 'own',
  insights_scope data_access_scope NOT NULL DEFAULT 'own',
  -- Specific restrictions
  can_export BOOLEAN NOT NULL DEFAULT true,
  can_bulk_edit BOOLEAN NOT NULL DEFAULT true,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  can_view_financials BOOLEAN NOT NULL DEFAULT true,
  can_view_sensitive BOOLEAN NOT NULL DEFAULT true,
  -- Assigned deals (if team scope is set)
  assigned_deal_ids UUID[] DEFAULT '{}',
  -- Notes/reason
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(user_id, company_id)
);

-- Enable RLS
ALTER TABLE public.user_data_permissions ENABLE ROW LEVEL SECURITY;

-- Policies for user_data_permissions
-- Admins can manage all permissions
CREATE POLICY "Admins can manage all permissions"
  ON public.user_data_permissions
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Users can read their own permissions
CREATE POLICY "Users can read own permissions"
  ON public.user_data_permissions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Create function to get user's data scope
CREATE OR REPLACE FUNCTION public.get_user_data_scope(
  _user_id UUID,
  _company_id UUID,
  _scope_type TEXT
)
RETURNS data_access_scope
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    CASE _scope_type
      WHEN 'deals' THEN COALESCE(deals_scope, 'own'::data_access_scope)
      WHEN 'lenders' THEN COALESCE(lenders_scope, 'all'::data_access_scope)
      WHEN 'analytics' THEN COALESCE(analytics_scope, 'own'::data_access_scope)
      WHEN 'reports' THEN COALESCE(reports_scope, 'own'::data_access_scope)
      WHEN 'insights' THEN COALESCE(insights_scope, 'own'::data_access_scope)
      ELSE 'own'::data_access_scope
    END
  FROM public.user_data_permissions
  WHERE user_id = _user_id
    AND (company_id = _company_id OR company_id IS NULL)
  ORDER BY company_id NULLS LAST
  LIMIT 1
$$;

-- Create function to check if user can access specific deal
CREATE OR REPLACE FUNCTION public.can_access_deal(_user_id UUID, _deal_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    CASE 
      -- Admin can access all
      WHEN public.has_role(_user_id, 'admin') THEN true
      -- Deal owner can always access
      WHEN EXISTS (SELECT 1 FROM deals WHERE id = _deal_id AND user_id = _user_id) THEN true
      -- Check permissions
      ELSE (
        SELECT 
          CASE 
            WHEN p.deals_scope = 'all' THEN true
            WHEN p.deals_scope = 'team' THEN _deal_id = ANY(p.assigned_deal_ids)
            WHEN p.deals_scope = 'own' THEN false
            ELSE false
          END
        FROM user_data_permissions p
        JOIN deals d ON d.id = _deal_id
        WHERE p.user_id = _user_id
          AND (p.company_id = d.company_id OR p.company_id IS NULL)
        LIMIT 1
      )
    END
$$;

-- Trigger to update updated_at
CREATE TRIGGER update_user_data_permissions_updated_at
  BEFORE UPDATE ON public.user_data_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();