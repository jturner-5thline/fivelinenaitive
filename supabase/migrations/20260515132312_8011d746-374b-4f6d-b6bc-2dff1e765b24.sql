
CREATE TABLE IF NOT EXISTS public.deal_document_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL,
  document_source text NOT NULL CHECK (document_source IN ('deal_space','data_room','vdr_internal')),
  document_id text NOT NULL,
  excluded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deal_id, document_source, document_id)
);

CREATE INDEX IF NOT EXISTS idx_dde_deal ON public.deal_document_exclusions (deal_id);

ALTER TABLE public.deal_document_exclusions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view deal exclusions"
ON public.deal_document_exclusions
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_document_exclusions.deal_id
      AND (d.user_id = auth.uid() OR d.company_id = ANY(public.get_user_company_ids(auth.uid())))
  )
);

CREATE POLICY "Members can insert deal exclusions"
ON public.deal_document_exclusions
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_document_exclusions.deal_id
      AND (d.user_id = auth.uid() OR d.company_id = ANY(public.get_user_company_ids(auth.uid())))
  )
);

CREATE POLICY "Members can delete deal exclusions"
ON public.deal_document_exclusions
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_document_exclusions.deal_id
      AND (d.user_id = auth.uid() OR d.company_id = ANY(public.get_user_company_ids(auth.uid())))
  )
);
