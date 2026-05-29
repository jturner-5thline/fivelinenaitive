ALTER TABLE public.deal_lenders
  ADD COLUMN IF NOT EXISTS master_lender_id uuid REFERENCES public.master_lenders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_deal_lenders_master_lender_id
  ON public.deal_lenders(master_lender_id);

INSERT INTO public.master_lenders (user_id, company_id, name, lender_type)
SELECT DISTINCT ON (d.company_id, lower(dl.name))
  d.user_id, d.company_id, dl.name, 'Migrated'
FROM public.deal_lenders dl
JOIN public.deals d ON d.id = dl.deal_id
WHERE d.company_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.master_lenders ml
    WHERE ml.company_id = d.company_id
      AND lower(ml.name) = lower(dl.name)
  );

UPDATE public.deal_lenders dl
SET master_lender_id = ml.id
FROM public.deals d, public.master_lenders ml
WHERE dl.deal_id = d.id
  AND ml.company_id = d.company_id
  AND lower(ml.name) = lower(dl.name)
  AND dl.master_lender_id IS NULL;

CREATE OR REPLACE FUNCTION public.enforce_deal_lender_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deal_company uuid;
  v_lender_company uuid;
BEGIN
  IF NEW.master_lender_id IS NULL THEN
    RAISE EXCEPTION
      'deal_lenders.master_lender_id is required: every funding source attached to a deal must reference a row in master_lenders for this tenant';
  END IF;

  SELECT company_id INTO v_deal_company FROM public.deals WHERE id = NEW.deal_id;
  SELECT company_id INTO v_lender_company FROM public.master_lenders WHERE id = NEW.master_lender_id;

  IF v_deal_company IS DISTINCT FROM v_lender_company THEN
    RAISE EXCEPTION
      'Cross-tenant funding source link blocked: deal tenant (%) does not match funding source tenant (%)',
      v_deal_company, v_lender_company;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_deal_lender_tenant ON public.deal_lenders;
CREATE TRIGGER trg_enforce_deal_lender_tenant
BEFORE INSERT OR UPDATE OF master_lender_id, deal_id
ON public.deal_lenders
FOR EACH ROW
EXECUTE FUNCTION public.enforce_deal_lender_tenant();