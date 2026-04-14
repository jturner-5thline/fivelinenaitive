
ALTER TABLE public.outbound_email_templates
  ADD COLUMN IF NOT EXISTS template_type text NOT NULL DEFAULT 'standalone',
  ADD COLUMN IF NOT EXISTS sequence_group_id text,
  ADD COLUMN IF NOT EXISTS sequence_step_key text,
  ADD COLUMN IF NOT EXISTS sequence_step_order integer;

CREATE INDEX IF NOT EXISTS idx_oet_sequence_group
  ON public.outbound_email_templates (company_id, sequence_group_id)
  WHERE sequence_group_id IS NOT NULL;
