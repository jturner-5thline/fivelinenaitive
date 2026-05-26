
-- Status enum
DO $$ BEGIN
  CREATE TYPE public.proposed_slot_status AS ENUM ('proposed','accepted','expired','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.proposed_meeting_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT,
  recipient_email TEXT,
  recipient_name TEXT,
  subject TEXT,
  deal_id UUID,
  slot_start TIMESTAMPTZ NOT NULL,
  slot_end TIMESTAMPTZ NOT NULL,
  timezone TEXT,
  duration_minutes INTEGER,
  status public.proposed_slot_status NOT NULL DEFAULT 'proposed',
  token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  google_event_id TEXT,
  accepted_at TIMESTAMPTZ,
  accepted_by_email TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pms_user_thread ON public.proposed_meeting_slots(user_id, thread_id);
CREATE INDEX IF NOT EXISTS idx_pms_token ON public.proposed_meeting_slots(token);
CREATE INDEX IF NOT EXISTS idx_pms_status ON public.proposed_meeting_slots(status);

ALTER TABLE public.proposed_meeting_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own proposed slots"
  ON public.proposed_meeting_slots FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert their own proposed slots"
  ON public.proposed_meeting_slots FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update their own proposed slots"
  ON public.proposed_meeting_slots FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete their own proposed slots"
  ON public.proposed_meeting_slots FOR DELETE
  USING (auth.uid() = user_id);

-- updated_at trigger (re-using existing helper if available)
CREATE OR REPLACE FUNCTION public.update_proposed_meeting_slots_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_pms_updated_at ON public.proposed_meeting_slots;
CREATE TRIGGER trg_pms_updated_at
  BEFORE UPDATE ON public.proposed_meeting_slots
  FOR EACH ROW EXECUTE FUNCTION public.update_proposed_meeting_slots_updated_at();
