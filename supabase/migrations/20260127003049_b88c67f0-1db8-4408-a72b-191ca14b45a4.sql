-- Create lender_contacts table for multiple contacts per lender
CREATE TABLE public.lender_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lender_id UUID NOT NULL REFERENCES public.master_lenders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT,
  email TEXT,
  phone TEXT,
  is_primary BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.lender_contacts ENABLE ROW LEVEL SECURITY;

-- Create policies - users can manage contacts for lenders they own
CREATE POLICY "Users can view lender contacts for their lenders"
  ON public.lender_contacts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.master_lenders ml
      WHERE ml.id = lender_id AND ml.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create contacts for their lenders"
  ON public.lender_contacts
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.master_lenders ml
      WHERE ml.id = lender_id AND ml.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update contacts for their lenders"
  ON public.lender_contacts
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.master_lenders ml
      WHERE ml.id = lender_id AND ml.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete contacts for their lenders"
  ON public.lender_contacts
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.master_lenders ml
      WHERE ml.id = lender_id AND ml.user_id = auth.uid()
    )
  );

-- Create updated_at trigger
CREATE TRIGGER update_lender_contacts_updated_at
  BEFORE UPDATE ON public.lender_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_lender_contacts_lender_id ON public.lender_contacts(lender_id);