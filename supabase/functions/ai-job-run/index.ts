// ─────────────────────────────────────────────────────────────────────────────
// ai-job-run — worker tick for the ai_jobs queue.
//
// Cron invokes this every minute. On each call the worker:
//   1. Reaps stuck 'running' jobs (>15min → back to queued or 'failed').
//   2. Claims up to MAX_JOBS_PER_TICK queued jobs atomically (SKIP LOCKED).
//   3. Dispatches each one to the matching handler by job_type.
//   4. Updates the row to 'completed' with output, or 'failed' with error.
//
// Handlers are intentionally thin: they call the *existing* long-running
// edge function (admin-agent-sweep, send-ux-insights-email, etc.) with
// service-role auth and stash the response as the job output. This lets us
// move heavy work off the request path without refactoring 2000-line
// internals — the sync callers just switch to enqueue.
//
// Auth model: verify_jwt=false + a shared X-Runner-Secret header, OR the
// service-role bearer (from cron). Anonymous internet callers are rejected.
// ─────────────────────────────────────────────────────────────────────────────
import { claimJobs, completeJob, failJob, reapStuck, type AiJobRow } from "../_shared/aiJobs.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-runner-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_JOBS_PER_TICK = 3;      // small: each job may run 60-120s
const HANDLER_TIMEOUT_MS = 12 * 60_000; // 12min, under the 15min reap cutoff

// ─── Handler registry ───────────────────────────────────────────────────
// Each handler receives the job row and returns the JSON to store in
// `output`. Throw to mark the job failed.
type Handler = (job: AiJobRow) => Promise<Record<string, unknown>>;

const HANDLERS: Record<string, Handler> = {
  admin_agent_sweep: (job) =>
    invokeExistingFunction("admin-agent-sweep", {
      // Pass through the caller's original input so the sweep can scope
      // to the same company / user context. The sweep's own auth already
      // handles company scoping from headers.
      ...job.input,
      _ai_job_id: job.id,
    }),

  send_ux_insights_email: (job) =>
    invokeExistingFunction("send-ux-insights-email", {
      ...job.input,
      _ai_job_id: job.id,
    }),

  recommend_lenders_batch: (job) =>
    invokeExistingFunction("recommend-lenders", {
      ...job.input,
      _ai_job_id: job.id,
    }),

  branded_doc_generate: (job) =>
    invokeExistingFunction("branded-doc-generate", {
      ...job.input,
      _ai_job_id: job.id,
    }),
};

/**
 * Invoke a peer edge function with service-role auth. We use a raw fetch
 * (not the JS client's `.invoke`) so we can capture the exact status/body
 * on failure — invoke swallows those into a generic FunctionsHttpError.
 */
async function invokeExistingFunction(
  functionName: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing SUPABASE_URL / service role key");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HANDLER_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
        "X-Ai-Job-Runner": "1",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`${functionName} → ${res.status}: ${text.slice(0, 500)}`);
    }
    // Store body if JSON, else raw text.
    try {
      return { status: res.status, response: JSON.parse(text) };
    } catch {
      return { status: res.status, response: text };
    }
  } finally {
    clearTimeout(timer);
  }
}

// ─── Auth ────────────────────────────────────────────────────────────────
function authorized(req: Request): boolean {
  // Cron includes the anon apikey header + a shared runner secret. Manual
  // debug calls from an authenticated admin also work if they pass the
  // service-role key.
  const runnerSecret = Deno.env.get("AI_JOB_RUNNER_SECRET");
  const provided = req.headers.get("x-runner-secret");
  if (runnerSecret && provided && provided === runnerSecret) return true;

  const auth = req.headers.get("authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (serviceKey && auth === `Bearer ${serviceKey}`) return true;

  return false;
}

// ─── Serve ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (!authorized(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const reaped = await reapStuck();
  const claimed = await claimJobs(MAX_JOBS_PER_TICK);

  console.log(
    `[ai-job-run] tick reaped=${reaped} claimed=${claimed.length}`,
  );

  const results: Array<{
    id: string;
    job_type: string;
    outcome: "completed" | "failed";
    error?: string;
  }> = [];

  // Run handlers sequentially per tick — protects downstream services from
  // getting hammered with 3 portfolio sweeps at once. Concurrency here would
  // also multiply memory/CPU cost inside the edge function runtime.
  for (const job of claimed) {
    const handler = HANDLERS[job.job_type];
    if (!handler) {
      await failJob(job.id, `Unknown job_type: ${job.job_type}`, {
        requeue: false,
      });
      results.push({
        id: job.id,
        job_type: job.job_type,
        outcome: "failed",
        error: "unknown_job_type",
      });
      continue;
    }

    try {
      const output = await handler(job);
      await completeJob(job.id, output);
      results.push({ id: job.id, job_type: job.job_type, outcome: "completed" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[ai-job-run] job ${job.id} (${job.job_type}) failed:`, msg);
      await failJob(job.id, msg);
      results.push({
        id: job.id,
        job_type: job.job_type,
        outcome: "failed",
        error: msg.slice(0, 300),
      });
    }
  }

  return new Response(
    JSON.stringify({ reaped, claimed: claimed.length, results }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
