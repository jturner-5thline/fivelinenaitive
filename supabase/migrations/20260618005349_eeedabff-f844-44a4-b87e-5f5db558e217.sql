CREATE UNIQUE INDEX IF NOT EXISTS master_lenders_demo_unique_company_visible_name
  ON public.master_lenders (company_id, lower(trim(name)))
  WHERE tags @> ARRAY['demo']::text[] AND name IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS deal_lenders_demo_unique_deal_visible_name
  ON public.deal_lenders (deal_id, lower(trim(name)))
  WHERE tags @> ARRAY['demo']::text[] AND name IS NOT NULL;