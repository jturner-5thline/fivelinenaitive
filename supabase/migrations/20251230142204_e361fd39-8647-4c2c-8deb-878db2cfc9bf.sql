-- Create company invitations table
CREATE TABLE public.company_invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role company_role NOT NULL DEFAULT 'member',
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token UUID NOT NULL DEFAULT gen_random_uuid(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id, email)
);

-- Enable RLS
ALTER TABLE public.company_invitations ENABLE ROW LEVEL SECURITY;

-- Admins can create invitations for their company
CREATE POLICY "Admins can create invitations"
ON public.company_invitations
FOR INSERT
WITH CHECK (is_company_admin(auth.uid(), company_id));

-- Admins can view invitations for their company
CREATE POLICY "Admins can view invitations"
ON public.company_invitations
FOR SELECT
USING (is_company_admin(auth.uid(), company_id));

-- Admins can delete invitations for their company
CREATE POLICY "Admins can delete invitations"
ON public.company_invitations
FOR DELETE
USING (is_company_admin(auth.uid(), company_id));

-- Anyone can view invitation by token (for accepting)
CREATE POLICY "Anyone can view invitation by token"
ON public.company_invitations
FOR SELECT
USING (true);