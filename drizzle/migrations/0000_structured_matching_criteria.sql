-- Funding source structured matching criteria
ALTER TABLE public.master_lenders
  ADD COLUMN IF NOT EXISTS sweet_spot_min numeric,
  ADD COLUMN IF NOT EXISTS sweet_spot_max numeric,
  ADD COLUMN IF NOT EXISTS min_gross_margin_pct numeric,
  ADD COLUMN IF NOT EXISTS max_leverage numeric,
  ADD COLUMN IF NOT EXISTS geographies text[],
  ADD COLUMN IF NOT EXISTS geographies_excluded text[],
  ADD COLUMN IF NOT EXISTS sponsor_requirement text,
  ADD COLUMN IF NOT EXISTS appetite_status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS criteria_confidence text,
  ADD COLUMN IF NOT EXISTS criteria_reviewed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_master_lenders_deal_range ON public.master_lenders (min_deal, max_deal);
CREATE INDEX IF NOT EXISTS idx_master_lenders_appetite ON public.master_lenders (appetite_status);

-- Deal-side normalized numeric criteria
ALTER TABLE public.deal_writeups
  ADD COLUMN IF NOT EXISTS capital_ask_amount numeric,
  ADD COLUMN IF NOT EXISTS ttm_revenue numeric,
  ADD COLUMN IF NOT EXISTS ttm_ebitda numeric,
  ADD COLUMN IF NOT EXISTS gross_margin_pct numeric,
  ADD COLUMN IF NOT EXISTS geo_state text,
  ADD COLUMN IF NOT EXISTS geo_country text,
  ADD COLUMN IF NOT EXISTS industry_normalized text;

-- Parses "$8,000,000", "8M", "8.5mm", "750k" into a numeric dollar amount
CREATE OR REPLACE FUNCTION public.parse_money_text(t text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  cleaned text;
  num numeric;
  suffix text;
BEGIN
  IF t IS NULL THEN RETURN NULL; END IF;
  cleaned := lower(regexp_replace(t, '[\$,\s]', '', 'g'));
  IF cleaned !~ '^[0-9]' THEN RETURN NULL; END IF;
  num := nullif(substring(cleaned from '^[0-9]+(\.[0-9]+)?'), '')::numeric;
  IF num IS NULL THEN RETURN NULL; END IF;
  suffix := substring(cleaned from '^[0-9]+(?:\.[0-9]+)?([a-z]*)');
  IF suffix LIKE 'b%' THEN num := num * 1000000000;
  ELSIF suffix LIKE 'mm%' OR suffix LIKE 'm%' THEN num := num * 1000000;
  ELSIF suffix LIKE 'k%' THEN num := num * 1000;
  END IF;
  RETURN num;
END;
$$;