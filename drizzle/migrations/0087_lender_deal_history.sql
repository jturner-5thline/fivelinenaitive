CREATE TABLE public.lender_deal_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  lender_id uuid NOT NULL REFERENCES public.master_lenders(id) ON DELETE CASCADE,
  borrower_name text NOT NULL,
  announced_on date,
  amount_usd numeric,
  amount_text text,
  product_type text,
  industry text,
  geography text,
  lender_role text,
  source_type text,
  source_ref text,
  evidence_grade text,
  status text NOT NULL DEFAULT 'proposed',
  proposed_by text,
  confirmed_by uuid,
  confirmed_at timestamptz,
  dedupe_key text UNIQUE,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.lender_deal_history.lender_role IS 'lead | participant | agent | sole | unknown';
COMMENT ON COLUMN public.lender_deal_history.source_type IS 'lender_email | press_release | lender_site | news | other';
COMMENT ON COLUMN public.lender_deal_history.evidence_grade IS 'lender_announced | third_party | inferred';
COMMENT ON COLUMN public.lender_deal_history.status IS 'proposed | confirmed | rejected';
COMMENT ON COLUMN public.lender_deal_history.dedupe_key IS 'lower(lender_id|borrower_name|YYYY-MM of announced_on), set by trigger';
CREATE INDEX lender_deal_history_lender_idx ON public.lender_deal_history(lender_id, announced_on DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lender_deal_history TO authenticated;
GRANT ALL ON public.lender_deal_history TO service_role;
ALTER TABLE public.lender_deal_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view lender deal history" ON public.lender_deal_history FOR SELECT TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));
CREATE POLICY "Company members can create lender deal history" ON public.lender_deal_history FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));
CREATE POLICY "Company members can review lender deal history" ON public.lender_deal_history FOR UPDATE TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));
CREATE POLICY "Authors and admins can delete lender deal history" ON public.lender_deal_history FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.lender_deal_history_prepare()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.company_id IS NULL THEN
      SELECT ml.company_id INTO NEW.company_id FROM public.master_lenders ml WHERE ml.id = NEW.lender_id;
    END IF;
  ELSE
    NEW.company_id := OLD.company_id;
    NEW.lender_id := OLD.lender_id;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := now();
  END IF;
  NEW.borrower_name := btrim(NEW.borrower_name);
  NEW.dedupe_key := lower(NEW.lender_id::text || '|' || NEW.borrower_name || '|' || coalesce(to_char(NEW.announced_on, 'YYYY-MM'), ''));
  IF NEW.status = 'confirmed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'confirmed') THEN
    NEW.confirmed_by := auth.uid();
    NEW.confirmed_at := now();
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.lender_deal_history_prepare() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER lender_deal_history_prepare BEFORE INSERT OR UPDATE ON public.lender_deal_history
  FOR EACH ROW EXECUTE FUNCTION public.lender_deal_history_prepare();