ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS current_lender_id uuid REFERENCES public.master_lenders(id) ON DELETE SET NULL;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS current_lender_name text;

CREATE TABLE public.deal_related_parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  crm_company_id uuid REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deal_related_parties_one_entity CHECK ((crm_company_id IS NULL) <> (contact_id IS NULL))
);
CREATE UNIQUE INDEX deal_related_parties_company_uniq ON public.deal_related_parties(deal_id, crm_company_id) WHERE crm_company_id IS NOT NULL;
CREATE UNIQUE INDEX deal_related_parties_contact_uniq ON public.deal_related_parties(deal_id, contact_id) WHERE contact_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_related_parties TO authenticated;
GRANT ALL ON public.deal_related_parties TO service_role;
ALTER TABLE public.deal_related_parties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Related parties readable by deal members" ON public.deal_related_parties
  FOR SELECT TO authenticated USING (public.can_access_deal(auth.uid(), deal_id));
CREATE POLICY "Related parties insertable by deal members" ON public.deal_related_parties
  FOR INSERT TO authenticated WITH CHECK (public.can_access_deal(auth.uid(), deal_id));
CREATE POLICY "Related parties deletable by deal members" ON public.deal_related_parties
  FOR DELETE TO authenticated USING (public.can_access_deal(auth.uid(), deal_id));

-- Hard isolation: deals can't move into or out of the Distressed Debt pipeline.
CREATE OR REPLACE FUNCTION public.enforce_distressed_debt_isolation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old_dd boolean; new_dd boolean;
BEGIN
  IF NEW.pipeline_id IS NOT DISTINCT FROM OLD.pipeline_id THEN RETURN NEW; END IF;
  SELECT EXISTS(SELECT 1 FROM deal_pipelines WHERE id = OLD.pipeline_id AND name = 'Distressed Debt') INTO old_dd;
  SELECT EXISTS(SELECT 1 FROM deal_pipelines WHERE id = NEW.pipeline_id AND name = 'Distressed Debt') INTO new_dd;
  IF old_dd OR new_dd THEN
    RAISE EXCEPTION 'Deals cannot be moved into or out of the Distressed Debt pipeline';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_enforce_distressed_debt_isolation BEFORE UPDATE OF pipeline_id ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.enforce_distressed_debt_isolation();