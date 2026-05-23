-- ===== Fix #5B: extend activity_logs with email columns =====
-- Existing columns: id, deal_id (NOT NULL), user_id, activity_type, description, metadata, created_at, user_display_name
-- For email activities, activity_type='email'. Unlinked inbound emails stay in `emails` only.

ALTER TABLE public.activity_logs
  ADD COLUMN IF NOT EXISTS direction text,           -- 'inbound' | 'outbound' | null
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS body text,
  ADD COLUMN IF NOT EXISTS from_address text,
  ADD COLUMN IF NOT EXISTS to_addresses text[],
  ADD COLUMN IF NOT EXISTS cc_addresses text[],
  ADD COLUMN IF NOT EXISTS bcc_addresses text[],
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS message_id text,
  ADD COLUMN IF NOT EXISTS thread_id text,
  ADD COLUMN IF NOT EXISTS in_reply_to text,
  ADD COLUMN IF NOT EXISTS provider text;            -- 'gmail' | 'outlook' | 'manual'

ALTER TABLE public.activity_logs
  ADD CONSTRAINT activity_logs_direction_chk
  CHECK (direction IS NULL OR direction IN ('inbound', 'outbound'));

CREATE INDEX IF NOT EXISTS idx_activity_logs_deal_sent_at
  ON public.activity_logs (deal_id, sent_at DESC NULLS LAST)
  WHERE activity_type = 'email';

CREATE INDEX IF NOT EXISTS idx_activity_logs_thread_id
  ON public.activity_logs (thread_id)
  WHERE activity_type = 'email' AND thread_id IS NOT NULL;

-- Partial unique on message_id (only for email rows with a message_id)
CREATE UNIQUE INDEX IF NOT EXISTS uq_activity_logs_message_id
  ON public.activity_logs (message_id)
  WHERE activity_type = 'email' AND message_id IS NOT NULL;

-- ===== Fix #6: recognition_overrides (learned associations) =====
CREATE TABLE IF NOT EXISTS public.recognition_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  from_address text,            -- lowercased; may be null if domain-only
  domain text,                  -- lowercased; may be null if from_address-only
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recognition_overrides_at_least_one
    CHECK (from_address IS NOT NULL OR domain IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_recognition_overrides_lookup
  ON public.recognition_overrides (org_company_id, from_address, domain);

ALTER TABLE public.recognition_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_read_recognition_overrides"
  ON public.recognition_overrides
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = auth.uid() AND cm.company_id = recognition_overrides.org_company_id
    )
  );

CREATE POLICY "members_insert_recognition_overrides"
  ON public.recognition_overrides
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = auth.uid() AND cm.company_id = recognition_overrides.org_company_id
    )
  );

CREATE POLICY "members_delete_recognition_overrides"
  ON public.recognition_overrides
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = auth.uid() AND cm.company_id = recognition_overrides.org_company_id
    )
  );

-- ===== Fix #6: recognition_log (telemetry) =====
CREATE TABLE IF NOT EXISTS public.recognition_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  message_id text,
  thread_id text,
  inputs_hash text,
  candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  chosen_deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  confidence numeric(4,3),
  signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  outcome text NOT NULL DEFAULT 'unlinked',   -- 'auto' | 'suggested' | 'unlinked' | 'override'
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recognition_log_org_created
  ON public.recognition_log (org_company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recognition_log_outcome
  ON public.recognition_log (org_company_id, outcome, created_at DESC);

ALTER TABLE public.recognition_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_read_recognition_log"
  ON public.recognition_log
  FOR SELECT
  TO authenticated
  USING (
    org_company_id IS NULL OR EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = auth.uid() AND cm.company_id = recognition_log.org_company_id
    )
  );

CREATE POLICY "service_insert_recognition_log"
  ON public.recognition_log
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
