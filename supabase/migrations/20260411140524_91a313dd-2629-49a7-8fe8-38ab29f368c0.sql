
-- Create channel_type enum
CREATE TYPE public.channel_type AS ENUM ('Banks', 'M&A and Investment Bankers', 'Service Providers', 'Investors');

-- Create channel_entries table
CREATE TABLE public.channel_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  channel_type public.channel_type NOT NULL DEFAULT 'Banks',
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  crm_company_id UUID REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT channel_entries_has_entity CHECK (contact_id IS NOT NULL OR crm_company_id IS NOT NULL)
);

-- Unique constraint to prevent duplicate contact-company pairs per org
CREATE UNIQUE INDEX idx_channel_entries_unique_pair
  ON public.channel_entries (company_id, COALESCE(contact_id, '00000000-0000-0000-0000-000000000000'), COALESCE(crm_company_id, '00000000-0000-0000-0000-000000000000'));

-- Enable RLS
ALTER TABLE public.channel_entries ENABLE ROW LEVEL SECURITY;

-- RLS policies: company members can CRUD
CREATE POLICY "Company members can view channel entries"
  ON public.channel_entries FOR SELECT
  TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can create channel entries"
  ON public.channel_entries FOR INSERT
  TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can update channel entries"
  ON public.channel_entries FOR UPDATE
  TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can delete channel entries"
  ON public.channel_entries FOR DELETE
  TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

-- Auto-update updated_at
CREATE TRIGGER update_channel_entries_updated_at
  BEFORE UPDATE ON public.channel_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
