-- ============================================================
-- AI Agent runs (chained autonomous task execution)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planning'
    CHECK (status IN ('planning','awaiting_plan_approval','running','awaiting_write_approval','completed','failed','cancelled')),
  plan_summary TEXT,
  final_summary TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,   -- { page, deal_id, deal_name, ... }
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_runs_user_created
  ON public.ai_agent_runs (user_id, created_at DESC);

ALTER TABLE public.ai_agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own agent runs"
  ON public.ai_agent_runs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users create their own agent runs"
  ON public.ai_agent_runs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update their own agent runs"
  ON public.ai_agent_runs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete their own agent runs"
  ON public.ai_agent_runs FOR DELETE
  USING (auth.uid() = user_id);


CREATE TABLE IF NOT EXISTS public.ai_agent_run_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.ai_agent_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  step_index INT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('read','write')),
  tool TEXT NOT NULL,                  -- gmail_search | gmail_draft_reply | deal_lookup | data_room_search | task_create | activity_post
  title TEXT NOT NULL,                 -- human-readable label shown in UI
  args JSONB NOT NULL DEFAULT '{}'::jsonb,
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','running','done','failed','skipped')),
  output JSONB,                        -- tool result, capped server-side
  output_summary TEXT,                 -- one-line human summary
  error TEXT,
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, step_index)
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_run_steps_run
  ON public.ai_agent_run_steps (run_id, step_index);

ALTER TABLE public.ai_agent_run_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view steps of their own runs"
  ON public.ai_agent_run_steps FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users create steps of their own runs"
  ON public.ai_agent_run_steps FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update steps of their own runs"
  ON public.ai_agent_run_steps FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete steps of their own runs"
  ON public.ai_agent_run_steps FOR DELETE
  USING (auth.uid() = user_id);


-- updated_at triggers (reuse existing public.update_updated_at_column if present;
-- otherwise create a local one).
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_agent_runs_touch ON public.ai_agent_runs;
CREATE TRIGGER trg_ai_agent_runs_touch
  BEFORE UPDATE ON public.ai_agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_ai_agent_run_steps_touch ON public.ai_agent_run_steps;
CREATE TRIGGER trg_ai_agent_run_steps_touch
  BEFORE UPDATE ON public.ai_agent_run_steps
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
