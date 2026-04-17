-- Add provenance columns for files uploaded from email attachments
ALTER TABLE public.deal_attachments
  ADD COLUMN IF NOT EXISTS source_email_id text,
  ADD COLUMN IF NOT EXISTS source_thread_id text,
  ADD COLUMN IF NOT EXISTS source_subject text,
  ADD COLUMN IF NOT EXISTS source_sender text;

-- Allow 'email_attachment' as a valid source value
ALTER TABLE public.deal_attachments
  DROP CONSTRAINT IF EXISTS deal_attachments_source_check;

ALTER TABLE public.deal_attachments
  ADD CONSTRAINT deal_attachments_source_check
  CHECK (source = ANY (ARRAY[
    'single_upload'::text,
    'bulk_upload'::text,
    'folder_upload'::text,
    'zip_upload'::text,
    'email_attachment'::text
  ]));

-- Helpful index for "show files sourced from this thread" lookups
CREATE INDEX IF NOT EXISTS idx_deal_attachments_source_thread
  ON public.deal_attachments (deal_id, source_thread_id)
  WHERE source_thread_id IS NOT NULL;