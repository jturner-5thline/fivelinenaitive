-- Add deal_class column to deals table to distinguish standard deals from naitive pipeline deals
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS deal_class text NOT NULL DEFAULT 'standard';

-- Create an index for efficient filtering by deal_class
CREATE INDEX IF NOT EXISTS idx_deals_deal_class ON public.deals (deal_class);

-- Backfill: mark any existing deals in the naitive pipeline as 'naitive'
UPDATE public.deals
SET deal_class = 'naitive'
WHERE pipeline_id IN (
  SELECT id FROM public.deal_pipelines
  WHERE name = 'naitive Pipeline'
    AND company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'
);