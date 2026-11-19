CREATE TABLE public.lender_intro_paths (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  lender_id uuid NOT NULL REFERENCES public.master_lenders(id) ON DELETE CASCADE,
  lender_contact_id uuid REFERENCES public.lender_contacts(id) ON DELETE SET NULL,
  from_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  from_user_id uuid,
  from_referral_source_id uuid REFERENCES public.referral_sources(id) ON DELETE SET NULL,
  from_name text,
  path_type text NOT NULL DEFAULT 'other',
  evidence_type text,
  evidence_ref text,
  occurred_on date,
  status text NOT NULL DEFAULT 'proposed',
  notes text,
  dedupe_key text UNIQUE,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.lender_intro_paths.path_type IS 'introduced_by | referred_by | former_colleague | mutual_connection | met_at_event | other';
COMMENT ON COLUMN public.lender_intro_paths.evidence_type IS 'intro_email | calendar | linkedin | referral_source | manual';
COMMENT ON COLUMN public.lender_intro_paths.status IS 'proposed | confirmed | rejected';
CREATE INDEX lender_intro_paths_lender_idx ON public.lender_intro_paths(lender_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lender_intro_paths TO authenticated;
GRANT ALL ON public.lender_intro_paths TO service_role;
ALTER TABLE public.lender_intro_paths ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view lender intro paths" ON public.lender_intro_paths FOR SELECT TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));
CREATE POLICY "Company members can create lender intro paths" ON public.lender_intro_paths FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));
CREATE POLICY "Company members can review lender intro paths" ON public.lender_intro_paths FOR UPDATE TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));
CREATE POLICY "Authors and admins can delete lender intro paths" ON public.lender_intro_paths FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.lender_intro_paths_prepare()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT ml.company_id INTO NEW.company_id FROM public.master_lenders ml WHERE ml.id = NEW.lender_id;
  ELSE
    NEW.company_id := OLD.company_id;
    NEW.lender_id := OLD.lender_id;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
  END IF;
  NEW.from_name := nullif(btrim(NEW.from_name), '');
  NEW.dedupe_key := lower(NEW.lender_id::text || '|' || coalesce(NEW.lender_contact_id::text, '') || '|' ||
    coalesce(NEW.from_contact_id::text, NEW.from_user_id::text, NEW.from_referral_source_id::text, NEW.from_name, '') || '|' || NEW.path_type);
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.lender_intro_paths_prepare() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER lender_intro_paths_prepare BEFORE INSERT OR UPDATE ON public.lender_intro_paths
  FOR EACH ROW EXECUTE FUNCTION public.lender_intro_paths_prepare();