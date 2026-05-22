
CREATE TABLE IF NOT EXISTS public.naitive_proposed_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  recipient_email TEXT,
  deal_id UUID,
  slot_start TIMESTAMPTZ NOT NULL,
  slot_end TIMESTAMPTZ NOT NULL,
  timezone TEXT,
  status TEXT NOT NULL DEFAULT 'proposed',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_naitive_proposed_slots_user ON public.naitive_proposed_slots(user_id);
CREATE INDEX IF NOT EXISTS idx_naitive_proposed_slots_recipient ON public.naitive_proposed_slots(recipient_email);
CREATE INDEX IF NOT EXISTS idx_naitive_proposed_slots_deal ON public.naitive_proposed_slots(deal_id);
CREATE INDEX IF NOT EXISTS idx_naitive_proposed_slots_status ON public.naitive_proposed_slots(status);

ALTER TABLE public.naitive_proposed_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own proposed slots"
  ON public.naitive_proposed_slots FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own proposed slots"
  ON public.naitive_proposed_slots FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own proposed slots"
  ON public.naitive_proposed_slots FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own proposed slots"
  ON public.naitive_proposed_slots FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_naitive_proposed_slots_updated_at
  BEFORE UPDATE ON public.naitive_proposed_slots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
