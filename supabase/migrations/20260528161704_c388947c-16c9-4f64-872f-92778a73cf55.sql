ALTER TABLE public.ai_action_audit
  ADD COLUMN IF NOT EXISTS target_lender_id uuid,
  ADD COLUMN IF NOT EXISTS field_changed text,
  ADD COLUMN IF NOT EXISTS old_value jsonb,
  ADD COLUMN IF NOT EXISTS new_value jsonb,
  ADD COLUMN IF NOT EXISTS success boolean;