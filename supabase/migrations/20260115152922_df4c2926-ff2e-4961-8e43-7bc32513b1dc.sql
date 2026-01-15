-- First drop the old constraint
ALTER TABLE public.deal_attachments DROP CONSTRAINT IF EXISTS deal_attachments_category_check;

-- Update existing rows to use valid categories
UPDATE public.deal_attachments 
SET category = 'other' 
WHERE category NOT IN ('materials', 'financials', 'agreements', 'other');

-- Add the new constraint with correct categories
ALTER TABLE public.deal_attachments ADD CONSTRAINT deal_attachments_category_check 
CHECK (category IN ('materials', 'financials', 'agreements', 'other'));