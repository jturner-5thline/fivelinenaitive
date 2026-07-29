// ─────────────────────────────────────────────────────────────────────────────
// aiJobs.ts — shared helpers for the async AI job queue (ai_jobs table).
//
// Any edge function that would otherwise block the UI for >1s on a Claude
// call (portfolio sweeps, digest generation, batch recommendations, doc
// generation) should enqueue an ai_jobs row and let `ai-job-run` process it.
//
// The runner uses SERVICE_ROLE to bypass RLS when updating job state; callers
// use per-request auth so RLS enforces "user can only queue their own jobs
// in their own company".
// ─────────────────────────────────────────────────────────────────────────────
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

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

/** Service-role client — for the runner only. Bypasses RLS. */
export function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Mark a running job as completed. Only the runner should call this
 * (uses service-role internally).
 */
export async function completeJob(
  jobId: string,
  output: Record<string, unknown>,
): Promise<void> {
  const sb = serviceClient();
  const { error } = await sb
    .from("ai_jobs")
    .update({
      status: "completed",
      output,
      completed_at: new Date().toISOString(),
      error: null,
    })
    .eq("id", jobId);
  if (error) console.error(`[ai_jobs] complete ${jobId} failed:`, error);
}

/**
 * Mark a running job as failed. If attempts < max_attempts, requeue it so
 * the next worker tick retries; otherwise leave it terminal.
 */
export async function failJob(
  jobId: string,
  message: string,
  { requeue = true }: { requeue?: boolean } = {},
): Promise<void> {
  const sb = serviceClient();
  const { data: job } = await sb
    .from("ai_jobs")
    .select("attempts, max_attempts")
    .eq("id", jobId)
    .maybeSingle();
  const canRetry =
    requeue && job && (job.attempts as number) < (job.max_attempts as number);

  const { error } = await sb
    .from("ai_jobs")
    .update({
      status: canRetry ? "queued" : "failed",
      error: message.slice(0, 4000),
      // If retrying, clear started_at so it re-appears in the queue index.
      started_at: canRetry ? null : new Date().toISOString(),
      completed_at: canRetry ? null : new Date().toISOString(),
    })
    .eq("id", jobId);
  if (error) console.error(`[ai_jobs] fail ${jobId} failed:`, error);
}

/** Claim up to `limit` queued jobs atomically (runner only). */
export async function claimJobs(limit: number): Promise<AiJobRow[]> {
  const sb = serviceClient();
  const { data, error } = await sb.rpc("ai_jobs_claim_batch", { _limit: limit });
  if (error) {
    console.error("[ai_jobs] claim failed:", error);
    return [];
  }
  return (data ?? []) as AiJobRow[];
}

/** Reap stuck 'running' jobs (>15min). Called at the start of each tick. */
export async function reapStuck(): Promise<number> {
  const sb = serviceClient();
  const { data, error } = await sb.rpc("ai_jobs_reap_stuck");
  if (error) {
    console.error("[ai_jobs] reap failed:", error);
    return 0;
  }
  return (data as number) ?? 0;
}
