-- ─── lender_pass_detections ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lender_pass_detections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  deal_lender_id UUID REFERENCES public.deal_lenders(id) ON DELETE SET NULL,
  lender_name TEXT NOT NULL,
  gmail_message_id TEXT NOT NULL,
  thread_id TEXT,
  sender_email TEXT,
  sender_name TEXT,
  confidence TEXT NOT NULL CHECK (confidence IN ('low','medium','high')),
  is_pass BOOLEAN NOT NULL DEFAULT false,
  reason_summary TEXT,
  source_quote TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','dismissed','superseded')),
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID,
  dismissed_at TIMESTAMPTZ,
  dismissed_by UUID,
  edited_reason TEXT,
  raw_classification JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (gmail_message_id, deal_id)
);

CREATE INDEX IF NOT EXISTS idx_lender_pass_detections_deal_id ON public.lender_pass_detections(deal_id);
CREATE INDEX IF NOT EXISTS idx_lender_pass_detections_message ON public.lender_pass_detections(gmail_message_id);
CREATE INDEX IF NOT EXISTS idx_lender_pass_detections_status ON public.lender_pass_detections(status);

ALTER TABLE public.lender_pass_detections ENABLE ROW LEVEL SECURITY;

-- Same-company users can read detections on deals in their company.
CREATE POLICY "lender_pass_detections_select_company"
  ON public.lender_pass_detections
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.deals d
      JOIN public.company_members cm ON cm.company_id = d.company_id
      WHERE d.id = lender_pass_detections.deal_id
        AND cm.user_id = auth.uid()
    )
  );

-- Same-company users (and edge functions via service_role) can insert.
CREATE POLICY "lender_pass_detections_insert_company"
  ON public.lender_pass_detections
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.deals d
      JOIN public.company_members cm ON cm.company_id = d.company_id
      WHERE d.id = lender_pass_detections.deal_id
        AND cm.user_id = auth.uid()
    )
  );

-- Same-company users can update (confirm / dismiss / edit).
CREATE POLICY "lender_pass_detections_update_company"
  ON public.lender_pass_detections
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.deals d
      JOIN public.company_members cm ON cm.company_id = d.company_id
      WHERE d.id = lender_pass_detections.deal_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE TRIGGER trg_lender_pass_detections_updated_at
  BEFORE UPDATE ON public.lender_pass_detections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ─── user_email_ai_preferences ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_email_ai_preferences (
  user_id UUID NOT NULL PRIMARY KEY,
  auto_commit_high_confidence_pass BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_email_ai_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_email_ai_preferences_select_self"
  ON public.user_email_ai_preferences
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user_email_ai_preferences_insert_self"
  ON public.user_email_ai_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_email_ai_preferences_update_self"
  ON public.user_email_ai_preferences
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_user_email_ai_preferences_updated_at
  BEFORE UPDATE ON public.user_email_ai_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();