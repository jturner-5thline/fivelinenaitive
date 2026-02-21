
-- Lender Notes table for internal institutional memory
CREATE TABLE public.lender_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lender_name TEXT NOT NULL,
  master_lender_id UUID REFERENCES public.master_lenders(id) ON DELETE SET NULL,
  author_user_id UUID NOT NULL,
  body TEXT NOT NULL,
  is_flag BOOLEAN NOT NULL DEFAULT false,
  tags TEXT[] DEFAULT '{}',
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.lender_notes ENABLE ROW LEVEL SECURITY;

-- Users can view notes from their company
CREATE POLICY "Company members can view lender notes" ON public.lender_notes
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

-- Users can create notes for their company
CREATE POLICY "Company members can create lender notes" ON public.lender_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    author_user_id = auth.uid()
    AND company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

-- Authors can update their own notes
CREATE POLICY "Authors can update own lender notes" ON public.lender_notes
  FOR UPDATE TO authenticated
  USING (author_user_id = auth.uid());

-- Authors can delete their own notes, admins can delete any
CREATE POLICY "Authors and admins can delete lender notes" ON public.lender_notes
  FOR DELETE TO authenticated
  USING (
    author_user_id = auth.uid()
    OR public.is_admin(auth.uid())
  );

CREATE TRIGGER update_lender_notes_updated_at
  BEFORE UPDATE ON public.lender_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_lender_notes_lender_name ON public.lender_notes (lender_name);
CREATE INDEX idx_lender_notes_company_id ON public.lender_notes (company_id);
CREATE INDEX idx_lender_notes_is_flag ON public.lender_notes (lender_name, is_flag) WHERE is_flag = true;
