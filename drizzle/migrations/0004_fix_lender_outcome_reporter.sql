CREATE OR REPLACE FUNCTION public.capture_lender_recommendation_outcome()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.lender_recommendation_outcome_status;
  v_stage text := lower(coalesce(NEW.stage, ''));
  v_track text := lower(coalesce(NEW.tracking_status, ''));
  v_run_id uuid;
  v_reported_by uuid;
BEGIN
  IF NEW.master_lender_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_track = 'excluded' THEN
    v_status := 'dismissed';
  ELSIF v_track = 'passed' OR NEW.passed_at IS NOT NULL OR NEW.declined_at IS NOT NULL
        OR v_stage LIKE '%pass%' OR v_stage LIKE '%declin%' THEN
    v_status := 'declined';
  ELSIF v_stage LIKE '%funded%' OR v_stage LIKE '%closed won%' OR v_stage LIKE '%won%' THEN
    v_status := 'closed_won';
  ELSIF v_stage LIKE '%term%' OR NEW.quote_amount IS NOT NULL THEN
    v_status := 'terms_issued';
  ELSIF v_stage LIKE '%diligence%' THEN
    v_status := 'diligence';
  ELSIF NEW.submitted_at IS NOT NULL OR v_stage LIKE '%review%' OR v_stage LIKE '%submitted%' THEN
    v_status := 'engaged';
  ELSIF NEW.last_contact_at IS NOT NULL OR v_stage LIKE '%outreach%' OR v_stage LIKE '%contact%' THEN
    v_status := 'contacted';
  ELSE
    v_status := 'recommended';
  END IF;

  SELECT r.id INTO v_run_id
  FROM public.lender_recommendation_runs r
  JOIN public.lender_recommendation_run_items i ON i.run_id = r.id
  WHERE r.deal_id = NEW.deal_id AND i.lender_id = NEW.master_lender_id
  ORDER BY r.generated_at DESC
  LIMIT 1;

  SELECT d.deal_owner_user_id INTO v_reported_by
  FROM public.deals d
  WHERE d.id = NEW.deal_id;

  IF v_reported_by IS NULL THEN
    SELECT cm.user_id INTO v_reported_by
    FROM public.company_members cm
    JOIN public.deals d ON d.company_id = cm.company_id
    WHERE d.id = NEW.deal_id AND cm.role = 'owner'
    ORDER BY cm.created_at
    LIMIT 1;
  END IF;

  IF v_reported_by IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.lender_recommendation_outcomes
    (deal_id, lender_id, lender_name, run_id, status, reported_by, reported_at)
  VALUES (NEW.deal_id, NEW.master_lender_id, NEW.name, v_run_id, v_status, v_reported_by, now())
  ON CONFLICT (deal_id, lender_id) WHERE lender_id IS NOT NULL
  DO UPDATE SET
    status = EXCLUDED.status,
    lender_name = EXCLUDED.lender_name,
    run_id = COALESCE(public.lender_recommendation_outcomes.run_id, EXCLUDED.run_id),
    reported_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_lender_recommendation_outcome ON public.deal_lenders;
CREATE TRIGGER trg_capture_lender_recommendation_outcome
AFTER INSERT OR UPDATE OF stage, tracking_status, submitted_at, passed_at, declined_at, quote_amount, last_contact_at
ON public.deal_lenders
FOR EACH ROW EXECUTE FUNCTION public.capture_lender_recommendation_outcome();