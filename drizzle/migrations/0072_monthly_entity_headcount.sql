CREATE TABLE public.monthly_entity_headcount (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 realm_id text NOT NULL,
 month date NOT NULL,
 headcount numeric(6,2),
 notes text,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid NOT NULL DEFAULT auth.uid(),
 UNIQUE(company_id, realm_id, month),
 CONSTRAINT headcount_nonnegative CHECK (headcount IS NULL OR headcount >= 0),
 CONSTRAINT headcount_month_start CHECK (extract(day from month) = 1),
 CONSTRAINT headcount_unit CHECK (realm_id IN ('193514877331929','9341451968897660','9130350272677286','123146077561874'))
);
GRANT SELECT, INSERT, UPDATE ON public.monthly_entity_headcount TO authenticated;
GRANT ALL ON public.monthly_entity_headcount TO service_role;
ALTER TABLE public.monthly_entity_headcount ENABLE ROW LEVEL SECURITY;
CREATE POLICY headcount_workspace_read ON public.monthly_entity_headcount FOR SELECT TO authenticated USING (
 company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid AND EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = monthly_entity_headcount.company_id AND cm.user_id = auth.uid())
);
CREATE POLICY headcount_workspace_insert ON public.monthly_entity_headcount FOR INSERT TO authenticated WITH CHECK (
 company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid AND EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = monthly_entity_headcount.company_id AND cm.user_id = auth.uid())
 AND lower(coalesce(auth.jwt()->>'email','')) IN ('jturner@5thline.co','jmoffitt@5thline.co','ffustinoni@5thline.co')
);
CREATE POLICY headcount_workspace_update ON public.monthly_entity_headcount FOR UPDATE TO authenticated USING (
 company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid AND EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = monthly_entity_headcount.company_id AND cm.user_id = auth.uid())
 AND lower(coalesce(auth.jwt()->>'email','')) IN ('jturner@5thline.co','jmoffitt@5thline.co','ffustinoni@5thline.co')
) WITH CHECK (
 company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid AND EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = monthly_entity_headcount.company_id AND cm.user_id = auth.uid())
 AND lower(coalesce(auth.jwt()->>'email','')) IN ('jturner@5thline.co','jmoffitt@5thline.co','ffustinoni@5thline.co')
);
CREATE FUNCTION public.stamp_monthly_entity_headcount() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 NEW.updated_at := now();
 NEW.updated_by := coalesce(auth.uid(), NEW.updated_by);
 RETURN NEW;
END;
$$;
CREATE TRIGGER stamp_monthly_entity_headcount BEFORE INSERT OR UPDATE ON public.monthly_entity_headcount FOR EACH ROW EXECUTE FUNCTION public.stamp_monthly_entity_headcount();