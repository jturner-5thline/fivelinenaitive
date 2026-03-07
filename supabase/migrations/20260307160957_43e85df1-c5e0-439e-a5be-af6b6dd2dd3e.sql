
-- Table to store company-level write-up field configuration
CREATE TABLE public.company_write_up_fields (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  is_required BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  field_type TEXT NOT NULL DEFAULT 'text',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id, field_key)
);

-- RLS
ALTER TABLE public.company_write_up_fields ENABLE ROW LEVEL SECURITY;

-- Company members can read their company's config
CREATE POLICY "Company members can read write-up fields"
  ON public.company_write_up_fields
  FOR SELECT
  TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

-- Company admins can manage write-up fields
CREATE POLICY "Company admins can insert write-up fields"
  ON public.company_write_up_fields
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_company_admin(auth.uid(), company_id) OR public.is_admin(auth.uid()));

CREATE POLICY "Company admins can update write-up fields"
  ON public.company_write_up_fields
  FOR UPDATE
  TO authenticated
  USING (public.is_company_admin(auth.uid(), company_id) OR public.is_admin(auth.uid()));

CREATE POLICY "Company admins can delete write-up fields"
  ON public.company_write_up_fields
  FOR DELETE
  TO authenticated
  USING (public.is_company_admin(auth.uid(), company_id) OR public.is_admin(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_company_write_up_fields_updated_at
  BEFORE UPDATE ON public.company_write_up_fields
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
