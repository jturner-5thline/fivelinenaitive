
CREATE TABLE IF NOT EXISTS public.deal_saved_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_saved_views_company ON public.deal_saved_views(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_deal_saved_views_company_default
  ON public.deal_saved_views(company_id) WHERE is_default;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_saved_views TO authenticated;
GRANT ALL ON public.deal_saved_views TO service_role;

ALTER TABLE public.deal_saved_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view saved views"
  ON public.deal_saved_views FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can insert saved views"
  ON public.deal_saved_views FOR INSERT TO authenticated
  WITH CHECK (
    public.is_company_member(auth.uid(), company_id)
    AND created_by = auth.uid()
  );

CREATE POLICY "Company members can update saved views"
  ON public.deal_saved_views FOR UPDATE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can delete saved views"
  ON public.deal_saved_views FOR DELETE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE TRIGGER update_deal_saved_views_updated_at
  BEFORE UPDATE ON public.deal_saved_views
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
