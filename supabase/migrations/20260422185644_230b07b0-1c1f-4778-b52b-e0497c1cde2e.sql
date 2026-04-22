-- Add FinServ-specific deal fields
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS lead_source text,
  ADD COLUMN IF NOT EXISTS referral_source text,
  ADD COLUMN IF NOT EXISTS opportunity_type text,
  ADD COLUMN IF NOT EXISTS services_offered text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS fee_type text,
  ADD COLUMN IF NOT EXISTS mrr numeric,
  ADD COLUMN IF NOT EXISTS one_time_revenue numeric,
  ADD COLUMN IF NOT EXISTS projected_close_date date,
  ADD COLUMN IF NOT EXISTS contract_start_date date,
  ADD COLUMN IF NOT EXISTS contract_end_date date,
  ADD COLUMN IF NOT EXISTS on_hold boolean NOT NULL DEFAULT false;

-- Validation: contract_end_date must be >= contract_start_date when both are set
CREATE OR REPLACE FUNCTION public.validate_deal_contract_dates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.contract_start_date IS NOT NULL
     AND NEW.contract_end_date IS NOT NULL
     AND NEW.contract_end_date < NEW.contract_start_date THEN
    RAISE EXCEPTION 'Contract end date must be on or after contract start date';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deals_validate_contract_dates ON public.deals;
CREATE TRIGGER deals_validate_contract_dates
  BEFORE INSERT OR UPDATE ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_deal_contract_dates();

-- Replace the FinServ pipeline stage list with the new simplified 8 stages.
-- Existing deals on retired stages are remapped to a sensible new equivalent.
UPDATE public.deal_pipelines
SET stages = '[
  {"id":"fs-qualification","label":"Qualification","color":"bg-slate-500"},
  {"id":"fs-discovery","label":"Discovery","color":"bg-blue-500"},
  {"id":"fs-qualified","label":"Qualified","color":"bg-indigo-500"},
  {"id":"fs-scoping","label":"Scoping","color":"bg-violet-500"},
  {"id":"fs-proposal-sent","label":"Proposal Sent","color":"bg-purple-500"},
  {"id":"fs-negotiation","label":"Negotiation","color":"bg-amber-500"},
  {"id":"fs-closed-won","label":"Closed Won","color":"bg-green-500"},
  {"id":"fs-closed-lost","label":"Closed Lost","color":"bg-red-500"}
]'::jsonb
WHERE name = 'FinServ Pipeline';

-- Remap legacy stage IDs on existing FinServ deals to the new stages.
-- On Hold legacy stage -> set on_hold=true and move to Qualification.
UPDATE public.deals d
SET stage = 'fs-qualification', on_hold = true
WHERE d.pipeline_id IN (SELECT id FROM public.deal_pipelines WHERE name = 'FinServ Pipeline')
  AND d.stage = 'fs-on-hold';

UPDATE public.deals d
SET stage = CASE d.stage
  WHEN 'fs-unresponsive' THEN 'fs-qualification'
  WHEN 'fs-indication-of-interest' THEN 'fs-discovery'
  WHEN 'fs-not-a-fit' THEN 'fs-closed-lost'
  WHEN 'fs-dropped-client' THEN 'fs-closed-lost'
  WHEN 'fs-evaluation' THEN 'fs-qualified'
  WHEN 'fs-proposal-dev' THEN 'fs-scoping'
  WHEN 'fs-proposal-sent' THEN 'fs-proposal-sent'
  WHEN 'fs-agreement-pending' THEN 'fs-negotiation'
  WHEN 'fs-active-client' THEN 'fs-closed-won'
  WHEN 'fs-client-churned' THEN 'fs-closed-lost'
  WHEN 'fs-client-lost' THEN 'fs-closed-lost'
  ELSE d.stage
END
WHERE d.pipeline_id IN (SELECT id FROM public.deal_pipelines WHERE name = 'FinServ Pipeline')
  AND d.stage IN (
    'fs-unresponsive','fs-indication-of-interest','fs-not-a-fit','fs-dropped-client',
    'fs-evaluation','fs-proposal-dev','fs-proposal-sent','fs-agreement-pending',
    'fs-active-client','fs-client-churned','fs-client-lost'
  );