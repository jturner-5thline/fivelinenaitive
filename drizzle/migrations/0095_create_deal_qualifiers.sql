CREATE TABLE public.deal_qualifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  text text NOT NULL DEFAULT '',
  is_met boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deal_qualifiers_deal_idx ON public.deal_qualifiers(deal_id, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_qualifiers TO authenticated;
GRANT ALL ON public.deal_qualifiers TO service_role;
ALTER TABLE public.deal_qualifiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dq select" ON public.deal_qualifiers FOR SELECT TO authenticated USING (public.can_access_deal(auth.uid(), deal_id));
CREATE POLICY "dq insert" ON public.deal_qualifiers FOR INSERT TO authenticated WITH CHECK (public.can_access_deal(auth.uid(), deal_id));
CREATE POLICY "dq update" ON public.deal_qualifiers FOR UPDATE TO authenticated USING (public.can_access_deal(auth.uid(), deal_id)) WITH CHECK (public.can_access_deal(auth.uid(), deal_id));
CREATE POLICY "dq delete" ON public.deal_qualifiers FOR DELETE TO authenticated USING (public.can_access_deal(auth.uid(), deal_id));
CREATE OR REPLACE FUNCTION public.deal_qualifiers_touch() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER deal_qualifiers_touch BEFORE UPDATE ON public.deal_qualifiers FOR EACH ROW EXECUTE FUNCTION public.deal_qualifiers_touch();