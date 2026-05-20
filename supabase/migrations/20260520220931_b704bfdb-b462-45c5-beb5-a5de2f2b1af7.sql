-- 1. Add contact_type column to contacts
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS contact_type text;

CREATE INDEX IF NOT EXISTS idx_contacts_contact_type
  ON public.contacts (org_company_id, contact_type)
  WHERE contact_type IS NOT NULL;

-- 2. Settings table for the option list
CREATE TABLE IF NOT EXISTS public.contact_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

ALTER TABLE public.contact_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contact_types_select" ON public.contact_types;
CREATE POLICY "contact_types_select" ON public.contact_types
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "contact_types_insert" ON public.contact_types;
CREATE POLICY "contact_types_insert" ON public.contact_types
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND public.is_company_admin(auth.uid(), company_id)
  );

DROP POLICY IF EXISTS "contact_types_update" ON public.contact_types;
CREATE POLICY "contact_types_update" ON public.contact_types
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND public.is_company_admin(auth.uid(), company_id)
  );

DROP POLICY IF EXISTS "contact_types_delete" ON public.contact_types;
CREATE POLICY "contact_types_delete" ON public.contact_types
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND public.is_company_admin(auth.uid(), company_id)
  );

DROP TRIGGER IF EXISTS update_contact_types_updated_at ON public.contact_types;
CREATE TRIGGER update_contact_types_updated_at
  BEFORE UPDATE ON public.contact_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Seed defaults for all existing companies
INSERT INTO public.contact_types (company_id, name, sort_order, is_default)
SELECT c.id, v.name, v.sort_order, true
FROM public.companies c
CROSS JOIN (VALUES
  ('Banker', 10),
  ('Lender', 20),
  ('Client', 30),
  ('Prospect', 40)
) AS v(name, sort_order)
ON CONFLICT (company_id, name) DO NOTHING;

-- 4. Auto-seed defaults for any new company
CREATE OR REPLACE FUNCTION public.seed_default_contact_types()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.contact_types (company_id, name, sort_order, is_default)
  VALUES
    (NEW.id, 'Banker',   10, true),
    (NEW.id, 'Lender',   20, true),
    (NEW.id, 'Client',   30, true),
    (NEW.id, 'Prospect', 40, true)
  ON CONFLICT (company_id, name) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_default_contact_types ON public.companies;
CREATE TRIGGER trg_seed_default_contact_types
  AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_contact_types();