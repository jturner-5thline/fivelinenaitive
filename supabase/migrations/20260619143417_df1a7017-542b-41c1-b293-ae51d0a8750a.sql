ALTER TABLE public.ai_action_queue
  ADD COLUMN IF NOT EXISTS executed_by uuid,
  ADD COLUMN IF NOT EXISTS on_approve_execution_type text,
  ADD COLUMN IF NOT EXISTS execution_result jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_ai_action_queue_executed_by ON public.ai_action_queue(executed_by);
CREATE INDEX IF NOT EXISTS idx_ai_action_queue_status ON public.ai_action_queue(status);