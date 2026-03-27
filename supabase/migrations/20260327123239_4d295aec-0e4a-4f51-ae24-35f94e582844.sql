
CREATE TABLE public.partner_memos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  memo_type TEXT NOT NULL DEFAULT 'Channel',
  who_are_they TEXT DEFAULT '',
  icp TEXT DEFAULT '',
  benefit_from_us TEXT DEFAULT '',
  benefit_from_them TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(partner_id)
);

ALTER TABLE public.partner_memos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can manage partner memos"
  ON public.partner_memos FOR ALL
  USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));
