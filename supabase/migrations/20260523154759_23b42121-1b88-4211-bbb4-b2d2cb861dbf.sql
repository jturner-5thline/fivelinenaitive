-- Hold lifecycle state
DO $$ BEGIN
  CREATE TYPE public.meeting_hold_state AS ENUM ('held','confirmed','released','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.meeting_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hold_group_id uuid NOT NULL,
  user_id uuid NOT NULL,
  org_company_id uuid,
  deal_id uuid,
  email_message_id text,
  slot_start_at timestamptz NOT NULL,
  slot_end_at timestamptz NOT NULL,
  google_event_id text,
  attendees jsonb NOT NULL DEFAULT '[]'::jsonb,
  state public.meeting_hold_state NOT NULL DEFAULT 'held',
  expires_at timestamptz NOT NULL,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meeting_holds_user_state ON public.meeting_holds (user_id, state);
CREATE INDEX IF NOT EXISTS idx_meeting_holds_group ON public.meeting_holds (hold_group_id);
CREATE INDEX IF NOT EXISTS idx_meeting_holds_sweep ON public.meeting_holds (state, expires_at);
CREATE INDEX IF NOT EXISTS idx_meeting_holds_slot ON public.meeting_holds (user_id, slot_start_at, slot_end_at);

ALTER TABLE public.meeting_holds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meeting_holds_select_own" ON public.meeting_holds;
CREATE POLICY "meeting_holds_select_own" ON public.meeting_holds
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "meeting_holds_insert_own" ON public.meeting_holds;
CREATE POLICY "meeting_holds_insert_own" ON public.meeting_holds
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "meeting_holds_update_own" ON public.meeting_holds;
CREATE POLICY "meeting_holds_update_own" ON public.meeting_holds
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "meeting_holds_delete_own" ON public.meeting_holds;
CREATE POLICY "meeting_holds_delete_own" ON public.meeting_holds
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_meeting_holds_updated_at ON public.meeting_holds;
CREATE TRIGGER trg_meeting_holds_updated_at
  BEFORE UPDATE ON public.meeting_holds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Per-user verification preferences
ALTER TABLE public.user_email_ai_preferences
  ADD COLUMN IF NOT EXISTS verify_on_send boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS place_soft_holds boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS hold_expiration_hours integer NOT NULL DEFAULT 72,
  ADD COLUMN IF NOT EXISTS min_required_slots integer NOT NULL DEFAULT 3;