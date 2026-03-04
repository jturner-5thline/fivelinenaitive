
-- Create user_permissions table for storing per-user permission settings
CREATE TABLE public.user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, company_id)
);

-- Enable RLS
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- Users can read their own permissions
CREATE POLICY "Users can read own permissions"
  ON public.user_permissions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Admins can read all permissions in their company
CREATE POLICY "Admins can read company permissions"
  ON public.user_permissions
  FOR SELECT
  TO authenticated
  USING (
    public.is_company_admin(auth.uid(), company_id)
    OR public.is_admin(auth.uid())
  );

-- Admins can insert permissions for their company
CREATE POLICY "Admins can insert permissions"
  ON public.user_permissions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_company_admin(auth.uid(), company_id)
    OR public.is_admin(auth.uid())
  );

-- Admins can update permissions for their company
CREATE POLICY "Admins can update permissions"
  ON public.user_permissions
  FOR UPDATE
  TO authenticated
  USING (
    public.is_company_admin(auth.uid(), company_id)
    OR public.is_admin(auth.uid())
  )
  WITH CHECK (
    public.is_company_admin(auth.uid(), company_id)
    OR public.is_admin(auth.uid())
  );

-- Admins can delete permissions
CREATE POLICY "Admins can delete permissions"
  ON public.user_permissions
  FOR DELETE
  TO authenticated
  USING (
    public.is_company_admin(auth.uid(), company_id)
    OR public.is_admin(auth.uid())
  );

-- Add updated_at trigger
CREATE TRIGGER update_user_permissions_updated_at
  BEFORE UPDATE ON public.user_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
