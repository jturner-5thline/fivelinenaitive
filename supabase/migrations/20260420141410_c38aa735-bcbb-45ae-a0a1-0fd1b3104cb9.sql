-- Workflow runs observability: structured per-step logging + status enum

-- 1. Add structured columns to workflow_runs
ALTER TABLE public.workflow_runs
  ADD COLUMN IF NOT EXISTS step text,
  ADD COLUMN IF NOT EXISTS error_step text,
  ADD COLUMN IF NOT EXISTS error_stack text,
  ADD COLUMN IF NOT EXISTS step_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS trigger_source text;

-- 2. Helpful indexes for the run-history UI and failure queries
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status_started
  ON public.workflow_runs (status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_started
  ON public.workflow_runs (workflow_id, started_at DESC);

-- 3. Same observability columns on scheduled_actions for delayed-step tracing
ALTER TABLE public.scheduled_actions
  ADD COLUMN IF NOT EXISTS fired_at timestamptz,
  ADD COLUMN IF NOT EXISTS drift_seconds numeric,
  ADD COLUMN IF NOT EXISTS error_stack text,
  ADD COLUMN IF NOT EXISTS step_log jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_scheduled_actions_status_due
  ON public.scheduled_actions (status, scheduled_for);

-- 4. Convenience view: most-recent run per workflow with key fields for the UI panel
CREATE OR REPLACE VIEW public.workflow_run_latest AS
SELECT DISTINCT ON (wr.workflow_id)
  wr.id,
  wr.workflow_id,
  wr.user_id,
  wr.status,
  wr.step,
  wr.error_step,
  wr.error_message,
  wr.trigger_source,
  wr.started_at,
  wr.completed_at,
  EXTRACT(EPOCH FROM (wr.completed_at - wr.started_at)) AS duration_seconds
FROM public.workflow_runs wr
ORDER BY wr.workflow_id, wr.started_at DESC;

-- 5. RLS already exists on workflow_runs (user_id-scoped). View inherits via security_invoker.
ALTER VIEW public.workflow_run_latest SET (security_invoker = on);
