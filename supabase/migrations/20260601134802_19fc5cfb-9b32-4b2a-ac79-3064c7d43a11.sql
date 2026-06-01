-- Allow system-generated audit rows (e.g., historical imports) without a user_id.
-- The Activity tab hook (useDealAuditLog) already coalesces null user_id → "System"
-- display with no avatar, so this does not require UI changes.

ALTER TABLE public.deal_audit_log
  ADD COLUMN IF NOT EXISTS source text;

ALTER TABLE public.deal_audit_log
  ALTER COLUMN user_id DROP NOT NULL;

-- Guarantee a row can never have BOTH user_id and source NULL.
ALTER TABLE public.deal_audit_log
  DROP CONSTRAINT IF EXISTS audit_user_or_system;

ALTER TABLE public.deal_audit_log
  ADD CONSTRAINT audit_user_or_system
  CHECK (user_id IS NOT NULL OR source IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_deal_audit_log_source
  ON public.deal_audit_log (source)
  WHERE source IS NOT NULL;