-- Add lender matching criteria fields to deal_writeups
ALTER TABLE public.deal_writeups
ADD COLUMN IF NOT EXISTS cash_burn_ok boolean,
ADD COLUMN IF NOT EXISTS b2b_b2c text,
ADD COLUMN IF NOT EXISTS revenue_type text,
ADD COLUMN IF NOT EXISTS collateral_available text;

-- Add comments for clarity
COMMENT ON COLUMN public.deal_writeups.cash_burn_ok IS 'Whether company is burning cash (true=burning, false=profitable)';
COMMENT ON COLUMN public.deal_writeups.b2b_b2c IS 'Business model: B2B, B2C, or Both';
COMMENT ON COLUMN public.deal_writeups.revenue_type IS 'Revenue type: recurring, transactional, contractual, mixed';
COMMENT ON COLUMN public.deal_writeups.collateral_available IS 'Collateral availability: yes, ar, minimal, none';