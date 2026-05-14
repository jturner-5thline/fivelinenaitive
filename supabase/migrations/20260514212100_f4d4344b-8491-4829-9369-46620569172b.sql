
CREATE TABLE public.deal_lender_recommendation_exclusions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL,
  lender_name TEXT NOT NULL,
  lender_id UUID,
  excluded_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX deal_lender_rec_excl_unique
  ON public.deal_lender_recommendation_exclusions (deal_id, lower(lender_name));
CREATE INDEX deal_lender_rec_excl_deal_idx
  ON public.deal_lender_recommendation_exclusions (deal_id);

ALTER TABLE public.deal_lender_recommendation_exclusions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View exclusions for accessible deals"
ON public.deal_lender_recommendation_exclusions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_id
      AND (
        CASE
          WHEN get_user_company_id(auth.uid()) IS NOT NULL
            THEN d.company_id = get_user_company_id(auth.uid())
              OR is_same_company_as_user(auth.uid(), d.user_id)
          ELSE auth.uid() = d.user_id
        END
      )
  )
);

CREATE POLICY "Insert exclusions for accessible deals"
ON public.deal_lender_recommendation_exclusions
FOR INSERT
WITH CHECK (
  excluded_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_id
      AND (
        CASE
          WHEN get_user_company_id(auth.uid()) IS NOT NULL
            THEN d.company_id = get_user_company_id(auth.uid())
              OR is_same_company_as_user(auth.uid(), d.user_id)
          ELSE auth.uid() = d.user_id
        END
      )
  )
);

CREATE POLICY "Delete exclusions for accessible deals"
ON public.deal_lender_recommendation_exclusions
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_id
      AND (
        CASE
          WHEN get_user_company_id(auth.uid()) IS NOT NULL
            THEN d.company_id = get_user_company_id(auth.uid())
              OR is_same_company_as_user(auth.uid(), d.user_id)
          ELSE auth.uid() = d.user_id
        END
      )
  )
);
