CREATE OR REPLACE FUNCTION public.set_master_lender_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS NULL AND NEW.user_id IS NOT NULL THEN
    NEW.company_id := (
      SELECT company_id FROM public.company_members
      WHERE user_id = NEW.user_id
      LIMIT 1
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_master_lender_company_id
  BEFORE INSERT ON public.master_lenders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_master_lender_company_id();