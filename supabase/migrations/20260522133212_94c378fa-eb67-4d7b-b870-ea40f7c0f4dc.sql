
ALTER TABLE public.naitive_proposed_slots
  ADD COLUMN IF NOT EXISTS recipient_emails text[],
  ADD COLUMN IF NOT EXISTS meeting_id uuid,
  ADD COLUMN IF NOT EXISTS conferencing_provider text,
  ADD COLUMN IF NOT EXISTS conferencing_meeting_id text;

CREATE INDEX IF NOT EXISTS idx_naitive_proposed_slots_user_proposed
  ON public.naitive_proposed_slots (user_id)
  WHERE status = 'proposed';
