CREATE TABLE public.meeting_deal_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_external_id text NOT NULL,
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  org_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  linked_by_user_id uuid NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mdl_meeting_active ON public.meeting_deal_links(meeting_external_id, org_company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_mdl_org ON public.meeting_deal_links(org_company_id);
CREATE INDEX idx_mdl_deal ON public.meeting_deal_links(deal_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_deal_links TO authenticated;
GRANT ALL ON public.meeting_deal_links TO service_role;

ALTER TABLE public.meeting_deal_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view meeting deal links"
  ON public.meeting_deal_links FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), org_company_id));

CREATE POLICY "Org members insert meeting deal links"
  ON public.meeting_deal_links FOR INSERT TO authenticated
  WITH CHECK (
    public.is_company_member(auth.uid(), org_company_id)
    AND linked_by_user_id = auth.uid()
  );

CREATE POLICY "Org members update meeting deal links"
  ON public.meeting_deal_links FOR UPDATE TO authenticated
  USING (public.is_company_member(auth.uid(), org_company_id));

CREATE POLICY "Org members delete meeting deal links"
  ON public.meeting_deal_links FOR DELETE TO authenticated
  USING (public.is_company_member(auth.uid(), org_company_id));

CREATE TRIGGER update_meeting_deal_links_updated_at
  BEFORE UPDATE ON public.meeting_deal_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();