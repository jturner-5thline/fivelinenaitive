-- Add metadata columns for stage-grouped email templates
ALTER TABLE public.outbound_email_templates
  ADD COLUMN IF NOT EXISTS trigger_stage text,
  ADD COLUMN IF NOT EXISTS cadence text,
  ADD COLUMN IF NOT EXISTS recipient text,
  ADD COLUMN IF NOT EXISTS approval_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS category text;

CREATE INDEX IF NOT EXISTS idx_outbound_email_templates_trigger_stage
  ON public.outbound_email_templates (company_id, trigger_stage);

-- Backfill the recently added 5th Line templates
UPDATE public.outbound_email_templates SET
  trigger_stage = 'Submitted to Lenders',
  cadence = 'Biweekly (≥3 new FLEx deals since last send)',
  recipient = 'Lender',
  category = 'From FLEx',
  approval_required = true
WHERE company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'
  AND title = 'Biweekly Email for Lenders from FLEx';

UPDATE public.outbound_email_templates SET
  trigger_stage = 'Agreement Signed',
  cadence = 'One Off',
  recipient = 'Client',
  category = 'Payment',
  approval_required = true
WHERE company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'
  AND title = 'Retainer Payment Email';

UPDATE public.outbound_email_templates SET
  trigger_stage = 'Funded / Invoiced',
  cadence = 'One Off',
  recipient = 'Client',
  category = 'Payment',
  approval_required = true
WHERE company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'
  AND title = 'Final Payment Email';

UPDATE public.outbound_email_templates SET
  trigger_stage = 'Terms Issued',
  cadence = 'One Off (per lender, if engagement includes milestone)',
  recipient = 'Client',
  category = 'Payment',
  approval_required = true
WHERE company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'
  AND title = 'Milestone Payment Email';

UPDATE public.outbound_email_templates SET
  trigger_stage = 'In Due Diligence',
  cadence = 'One Off',
  recipient = 'Client',
  category = 'Internal Comms with Client',
  approval_required = true
WHERE company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'
  AND title = 'Ongoing Education Email to Client';

UPDATE public.outbound_email_templates SET
  trigger_stage = 'Closed / Funded',
  cadence = 'One Off',
  recipient = 'Client',
  category = 'Wrap-Up / Relationship',
  approval_required = true
WHERE company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'
  AND title = 'Final Customer Email';