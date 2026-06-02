-- Expand allowed source values to cover email-body / email-highlight saves
ALTER TABLE public.deal_attachments DROP CONSTRAINT IF EXISTS deal_attachments_source_check;
ALTER TABLE public.deal_attachments ADD CONSTRAINT deal_attachments_source_check
  CHECK (source = ANY (ARRAY[
    'single_upload'::text,
    'bulk_upload'::text,
    'folder_upload'::text,
    'zip_upload'::text,
    'email_attachment'::text,
    'email_body'::text,
    'email_highlight'::text,
    'ai_generated'::text,
    'manual'::text
  ]));

-- Idempotency: prevent duplicate (deal_id, source_email_id, source) rows when an email source is set
CREATE UNIQUE INDEX IF NOT EXISTS deal_attachments_email_source_unique
  ON public.deal_attachments (deal_id, source_email_id, source)
  WHERE source_email_id IS NOT NULL;
