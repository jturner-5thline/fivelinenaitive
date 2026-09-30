CREATE TABLE public.crm_table_layouts (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  table_key text NOT NULL,
  column_order text[] NOT NULL DEFAULT '{}',
  hidden_columns text[] NOT NULL DEFAULT '{}',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, table_key)
);
GRANT SELECT, INSERT, UPDATE ON public.crm_table_layouts TO authenticated;
GRANT ALL ON public.crm_table_layouts TO service_role;
ALTER TABLE public.crm_table_layouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view table layouts" ON public.crm_table_layouts FOR SELECT TO authenticated USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "Members insert table layouts" ON public.crm_table_layouts FOR INSERT TO authenticated WITH CHECK (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "Members update table layouts" ON public.crm_table_layouts FOR UPDATE TO authenticated USING (public.is_company_member(auth.uid(), company_id)) WITH CHECK (public.is_company_member(auth.uid(), company_id));
ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_table_layouts;