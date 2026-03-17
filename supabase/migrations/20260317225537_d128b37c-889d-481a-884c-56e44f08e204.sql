
-- Create default_milestones table scoped to company
CREATE TABLE public.default_milestones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  days_from_creation INTEGER,
  timing_type TEXT NOT NULL DEFAULT 'from_creation',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_default_milestones_company ON public.default_milestones(company_id);

-- Enable RLS
ALTER TABLE public.default_milestones ENABLE ROW LEVEL SECURITY;

-- Company members can read their company's milestones
CREATE POLICY "Company members can read default milestones"
  ON public.default_milestones
  FOR SELECT
  TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

-- Company admins can insert
CREATE POLICY "Company admins can insert default milestones"
  ON public.default_milestones
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_company_admin(auth.uid(), company_id));

-- Company admins can update
CREATE POLICY "Company admins can update default milestones"
  ON public.default_milestones
  FOR UPDATE
  TO authenticated
  USING (public.is_company_admin(auth.uid(), company_id));

-- Company admins can delete
CREATE POLICY "Company admins can delete default milestones"
  ON public.default_milestones
  FOR DELETE
  TO authenticated
  USING (public.is_company_admin(auth.uid(), company_id));

-- Platform admins can do everything
CREATE POLICY "Platform admins full access to default milestones"
  ON public.default_milestones
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Updated_at trigger
CREATE TRIGGER update_default_milestones_updated_at
  BEFORE UPDATE ON public.default_milestones
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default milestones for all existing companies that don't have any
INSERT INTO public.default_milestones (company_id, title, days_from_creation, timing_type, position)
SELECT c.id, m.title, m.days_from_creation, m.timing_type, m.position
FROM public.companies c
CROSS JOIN (
  VALUES 
    ('Kick-off Call', 3, 'from_creation', 0),
    ('Due Diligence Complete', 14, 'from_creation', 1),
    ('Term Sheet Received', 30, 'from_creation', 2)
) AS m(title, days_from_creation, timing_type, position)
WHERE NOT EXISTS (
  SELECT 1 FROM public.default_milestones dm WHERE dm.company_id = c.id
);
