
CREATE TABLE public.docusign_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  account_id TEXT,
  base_uri TEXT,
  account_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

ALTER TABLE public.docusign_tokens ENABLE ROW LEVEL SECURITY;

-- Only company admins can view/manage DocuSign tokens
CREATE POLICY "Company admins can view docusign tokens"
  ON public.docusign_tokens FOR SELECT
  TO authenticated
  USING (public.is_company_admin(auth.uid(), company_id));

CREATE POLICY "Company admins can insert docusign tokens"
  ON public.docusign_tokens FOR INSERT
  TO authenticated
  WITH CHECK (public.is_company_admin(auth.uid(), company_id));

CREATE POLICY "Company admins can update docusign tokens"
  ON public.docusign_tokens FOR UPDATE
  TO authenticated
  USING (public.is_company_admin(auth.uid(), company_id));

CREATE POLICY "Company admins can delete docusign tokens"
  ON public.docusign_tokens FOR DELETE
  TO authenticated
  USING (public.is_company_admin(auth.uid(), company_id));

CREATE TRIGGER update_docusign_tokens_updated_at
  BEFORE UPDATE ON public.docusign_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
