-- ─────────────────────────────────────────────────────────────────────────────
-- ai_jobs — shared async queue for non-latency-sensitive AI work.
-- Any edge function that would otherwise block the UI for >1s should enqueue
-- here and let `ai-job-run` process it.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE public.ai_job_status AS ENUM (
  'queued', 'running', 'completed', 'failed', 'cancelled'
);

CREATE TABLE public.ai_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL,
  status public.ai_job_status NOT NULL DEFAULT 'queued',

  -- Tenancy + ownership. company_id lets RLS scope reads to workspace peers;
  -- requested_by names the human who kicked it off (nullable for cron jobs).
  company_id UUID,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Optional entity refs. All nullable — some jobs (portfolio sweeps) aren't
  -- tied to a single row. Kept as UUIDs, not FKs, so an entity delete doesn't
  -- cascade-erase its job history.
  entity_type TEXT,          -- 'deal' | 'company' | 'contact' | 'portfolio' | ...
  entity_id UUID,

  -- Freeform key so callers can enforce "one in-flight per (type, key)"
  -- without another table. Enforced by the partial unique index below.
  dedupe_key TEXT,

  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB,
  error TEXT,

  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  priority SMALLINT NOT NULL DEFAULT 0,  -- higher = picked first

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Worker picks by (status, priority, created_at). Partial index keeps it tiny.
CREATE INDEX idx_ai_jobs_queue_pick
  ON public.ai_jobs (priority DESC, created_at ASC)
  WHERE status = 'queued';

CREATE INDEX idx_ai_jobs_company_status
  ON public.ai_jobs (company_id, status, created_at DESC);

CREATE INDEX idx_ai_jobs_requested_by_status
  ON public.ai_jobs (requested_by, status, created_at DESC);

CREATE INDEX idx_ai_jobs_entity
  ON public.ai_jobs (entity_type, entity_id, created_at DESC)
  WHERE entity_id IS NOT NULL;

-- One live job per (job_type, dedupe_key) prevents accidental duplicate
-- portfolio sweeps or repeat digest generation from concurrent clicks.
CREATE UNIQUE INDEX ux_ai_jobs_dedupe_inflight
  ON public.ai_jobs (job_type, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status IN ('queued', 'running');

-- keep updated_at fresh
CREATE OR REPLACE FUNCTION public.ai_jobs_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

CREATE TRIGGER trg_ai_jobs_touch
  BEFORE UPDATE ON public.ai_jobs
  FOR EACH ROW EXECUTE FUNCTION public.ai_jobs_touch_updated_at();

-- ─── Grants ──────────────────────────────────────────────────────────────
-- authenticated: read/insert/update their own company's jobs (RLS enforces).
-- service_role: full access for the runner edge function.
GRANT SELECT, INSERT, UPDATE ON public.ai_jobs TO authenticated;
GRANT ALL ON public.ai_jobs TO service_role;

-- ─── RLS ────────────────────────────────────────────────────────────────
ALTER TABLE public.ai_jobs ENABLE ROW LEVEL SECURITY;

-- Read: any member of the job's company OR the requester themselves.
CREATE POLICY "ai_jobs_select_company_members" ON public.ai_jobs
  FOR SELECT TO authenticated
  USING (
    requested_by = auth.uid()
    OR (
      company_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.company_id = ai_jobs.company_id
          AND cm.user_id = auth.uid()
      )
    )
  );

-- Insert: user must be creating a job for themselves in a company they belong
-- to (or with no company scoping, e.g. personal jobs).
CREATE POLICY "ai_jobs_insert_self" ON public.ai_jobs
  FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND (
      company_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.company_id = ai_jobs.company_id
          AND cm.user_id = auth.uid()
      )
    )
  );

-- Update: only to cancel your own queued jobs. Runner (service_role) bypasses
-- RLS and handles status transitions for running/completed/failed.
CREATE POLICY "ai_jobs_update_cancel_own" ON public.ai_jobs
  FOR UPDATE TO authenticated
  USING (
    requested_by = auth.uid() AND status = 'queued'
  )
  WITH CHECK (
    requested_by = auth.uid() AND status IN ('queued', 'cancelled')
  );

-- ─── Worker claim helper ────────────────────────────────────────────────
-- Atomically claim up to N queued jobs. Uses FOR UPDATE SKIP LOCKED so
-- concurrent workers don't fight over the same row. Returns the claimed
-- rows so the runner can dispatch them.
CREATE OR REPLACE FUNCTION public.ai_jobs_claim_batch(_limit INT DEFAULT 3)
RETURNS SETOF public.ai_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id FROM public.ai_jobs
    WHERE status = 'queued' AND attempts < max_attempts
    ORDER BY priority DESC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, _limit)
  )
  UPDATE public.ai_jobs j
  SET status = 'running',
      started_at = now(),
      attempts = j.attempts + 1
  FROM picked
  WHERE j.id = picked.id
  RETURNING j.*;
END $$;

-- Only the runner (service_role) needs this. Not exposed to authenticated.
REVOKE ALL ON FUNCTION public.ai_jobs_claim_batch(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_jobs_claim_batch(INT) TO service_role;

-- Reap jobs stuck in 'running' longer than 15 min (function crashed or
-- timed out) so they can be retried by the next worker tick.
CREATE OR REPLACE FUNCTION public.ai_jobs_reap_stuck()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE reaped INT;
BEGIN
  UPDATE public.ai_jobs
  SET status = CASE
        WHEN attempts >= max_attempts THEN 'failed'::public.ai_job_status
        ELSE 'queued'::public.ai_job_status
      END,
      error = COALESCE(error, '') ||
        CASE WHEN error IS NULL OR error = '' THEN '' ELSE E'\n' END ||
        'Reaped: no progress after 15 min',
      started_at = NULL
  WHERE status = 'running'
    AND started_at < now() - INTERVAL '15 minutes';
  GET DIAGNOSTICS reaped = ROW_COUNT;
  RETURN reaped;
END $$;

REVOKE ALL ON FUNCTION public.ai_jobs_reap_stuck() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_jobs_reap_stuck() TO service_role;