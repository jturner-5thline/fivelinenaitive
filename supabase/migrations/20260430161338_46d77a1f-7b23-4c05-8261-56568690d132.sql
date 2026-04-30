
-- AI Action Queue: deferred AI-suggested actions awaiting user approval.
CREATE TABLE IF NOT EXISTS public.ai_action_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  deal_id uuid NULL,
  deal_name text NULL,
  action_type text NOT NULL CHECK (action_type IN (
    'create_task',
    'update_lender_status',
    'save_to_data_room',
    'log_note',
    'deal_update'
  )),
  title text NOT NULL,
  description text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source jsonb NOT NULL DEFAULT '{}'::jsonb, -- { email_id, thread_id, subject, from }
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','dismissed','expired','failed')),
  approved_at timestamptz NULL,
  dismissed_at timestamptz NULL,
  executed_at timestamptz NULL,
  execution_error text NULL,
  reminder_sent_at timestamptz NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_action_queue_user_status_expires
  ON public.ai_action_queue (user_id, status, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_action_queue_deal
  ON public.ai_action_queue (deal_id);

ALTER TABLE public.ai_action_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own queued actions"
  ON public.ai_action_queue FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own queued actions"
  ON public.ai_action_queue FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own queued actions"
  ON public.ai_action_queue FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own queued actions"
  ON public.ai_action_queue FOR DELETE
  USING (auth.uid() = user_id);

-- Reuse existing updated_at helper if present; otherwise create.
CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_ai_action_queue_updated_at ON public.ai_action_queue;
CREATE TRIGGER trg_ai_action_queue_updated_at
  BEFORE UPDATE ON public.ai_action_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();
