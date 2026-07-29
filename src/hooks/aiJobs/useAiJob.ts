// ─────────────────────────────────────────────────────────────────────────────
// useAiJob / useEnqueueAiJob — client bindings for the async ai_jobs queue.
//
// The queue lives server-side (see supabase/functions/ai-job-run). The UI's
// job here is simply: (1) POST to /ai-job-enqueue, (2) poll the row until it
// reaches a terminal status, (3) surface queued/running/completed/failed to
// the user with a manual regenerate option.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AiJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface AiJobRow {
  id: string;
  job_type: string;
  status: AiJobStatus;
  company_id: string | null;
  requested_by: string | null;
  entity_type: string | null;
  entity_id: string | null;
  dedupe_key: string | null;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  attempts: number;
  max_attempts: number;
  priority: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

export type KnownJobType =
  | "admin_agent_sweep"
  | "send_ux_insights_email"
  | "recommend_lenders_batch"
  | "branded_doc_generate";

interface EnqueueArgs {
  job_type: KnownJobType;
  company_id?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  dedupe_key?: string | null;
  priority?: number;
  input?: Record<string, unknown>;
}

interface EnqueueResult {
  job: Pick<AiJobRow, "id" | "status" | "created_at"> | null;
  /** true when a duplicate was already in flight and we returned the existing one. */
  alreadyInFlight: boolean;
  error?: string;
}

/**
 * Enqueue an async AI job. Returns the created (or existing in-flight) row.
 * Handles the 409 dedupe response by returning the pre-existing job so the
 * caller can pass its id to useAiJob() and attach to progress.
 */
export function useEnqueueAiJob() {
  const [isEnqueueing, setIsEnqueueing] = useState(false);

  const enqueue = useCallback(async (args: EnqueueArgs): Promise<EnqueueResult> => {
    setIsEnqueueing(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-job-enqueue", {
        body: args,
      });

      // supabase-js maps 409 to error; unwrap the body so we can detect dedupe.
      if (error) {
        const ctx = (error as unknown as { context?: { text?: () => Promise<string> } }).context;
        if (ctx?.text) {
          try {
            const parsed = JSON.parse(await ctx.text());
            if (parsed?.error === "already_in_flight" && parsed?.job) {
              return { job: parsed.job, alreadyInFlight: true };
            }
            return { job: null, alreadyInFlight: false, error: parsed?.error ?? error.message };
          } catch {
            return { job: null, alreadyInFlight: false, error: error.message };
          }
        }
        return { job: null, alreadyInFlight: false, error: error.message };
      }
      return { job: data?.job ?? null, alreadyInFlight: false };
    } finally {
      setIsEnqueueing(false);
    }
  }, []);

  return { enqueue, isEnqueueing };
}

/**
 * Poll an AI job until it reaches a terminal state. Adaptive interval:
 *   - 2s while queued or running (fast enough to feel live)
 *   - stops entirely once completed/failed/cancelled
 * Pass `jobId = null` to detach.
 */
export function useAiJob(jobId: string | null): {
  job: AiJobRow | null;
  loading: boolean;
  error: string | null;
} {
  const [job, setJob] = useState<AiJobRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    if (!jobId) {
      setJob(null);
      setError(null);
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    setLoading(true);

    const tick = async () => {
      if (cancelledRef.current) return;
      const { data, error: qErr } = await supabase
        .from("ai_jobs")
        .select("*")
        .eq("id", jobId)
        .maybeSingle<AiJobRow>();
      if (cancelledRef.current) return;

      if (qErr) {
        setError(qErr.message);
        setLoading(false);
        return;
      }
      setJob(data);
      setLoading(false);

      const terminal =
        !data ||
        data.status === "completed" ||
        data.status === "failed" ||
        data.status === "cancelled";
      if (!terminal) {
        timer = setTimeout(tick, 2000);
      }
    };
    tick();

    return () => {
      cancelledRef.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId]);

  return { job, loading, error };
}

/**
 * Cancel a queued job (RLS enforces: requester + still queued).
 * Running jobs cannot be cancelled — they finish on their own.
 */
export async function cancelAiJob(jobId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("ai_jobs")
    .update({ status: "cancelled" })
    .eq("id", jobId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
