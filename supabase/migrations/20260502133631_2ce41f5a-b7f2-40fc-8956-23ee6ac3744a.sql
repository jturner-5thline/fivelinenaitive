
-- Per-deal custom AI instructions
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS ai_custom_instructions text;

-- Cache of extracted text for Deal Space documents
ALTER TABLE public.deal_space_documents
  ADD COLUMN IF NOT EXISTS extracted_text text,
  ADD COLUMN IF NOT EXISTS extracted_at timestamptz,
  ADD COLUMN IF NOT EXISTS extraction_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS extraction_error text;

-- Cache of extracted text for Data Room (deal_attachments)
ALTER TABLE public.deal_attachments
  ADD COLUMN IF NOT EXISTS extracted_text text,
  ADD COLUMN IF NOT EXISTS extracted_at timestamptz,
  ADD COLUMN IF NOT EXISTS extraction_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS extraction_error text;

CREATE INDEX IF NOT EXISTS idx_deal_space_documents_deal_extracted
  ON public.deal_space_documents (deal_id) WHERE extracted_text IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_deal_attachments_deal_extracted
  ON public.deal_attachments (deal_id) WHERE extracted_text IS NOT NULL;
