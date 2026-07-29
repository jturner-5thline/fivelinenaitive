// ─────────────────────────────────────────────────────────────────────────────
// ai-job-enqueue — HTTP endpoint the frontend calls to queue an async AI job.
//
// This function does NOT do AI work. It validates the request, writes a row
// to ai_jobs (with per-user auth so RLS enforces tenancy), and returns the
// job id. The `ai-job-run` worker picks it up on the next tick.
//
// Why an edge function instead of a direct client insert? Two reasons:
//   1. We can whitelist job_type here so bad clients can't queue arbitrary
//      types the runner doesn't know how to dispatch.
//   2. Dedupe collisions surface as a friendly "already in flight" instead
//      of a raw unique-constraint error to the caller.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Only these job_types are dispatchable — keep in sync with ai-job-run.
const KNOWN_JOB_TYPES = [
  "admin_agent_sweep",
  "send_ux_insights_email",
  "recommend_lenders_batch",
  "branded_doc_generate",
] as const;

const BodySchema = z.object({
  job_type: z.enum(KNOWN_JOB_TYPES),
  entity_type: z.string().min(1).max(64).nullable().optional(),
  entity_id: z.string().uuid().nullable().optional(),
  company_id: z.string().uuid().nullable().optional(),
  dedupe_key: z.string().min(1).max(200).nullable().optional(),
  priority: z.number().int().min(-10).max(10).optional(),
  input: z.record(z.unknown()).default({}),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Per-user client so RLS enforces "only queue for your company".
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: "Invalid request",
        details: parsed.error.flatten(),
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
  const p = parsed.data;

  const { data: inserted, error: insErr } = await sb
    .from("ai_jobs")
    .insert({
      job_type: p.job_type,
      company_id: p.company_id ?? null,
      entity_type: p.entity_type ?? null,
      entity_id: p.entity_id ?? null,
      dedupe_key: p.dedupe_key ?? null,
      priority: p.priority ?? 0,
      input: p.input,
      requested_by: userData.user.id,
    })
    .select("id, status, created_at")
    .single();

  if (insErr) {
    // 23505 = unique_violation from ux_ai_jobs_dedupe_inflight. Surface a
    // 409 with the existing job id so the UI can attach to it instead of
    // creating a duplicate.
    if ((insErr as { code?: string }).code === "23505") {
      const { data: existing } = await sb
        .from("ai_jobs")
        .select("id, status, created_at")
        .eq("job_type", p.job_type)
        .eq("dedupe_key", p.dedupe_key!)
        .in("status", ["queued", "running"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return new Response(
        JSON.stringify({
          error: "already_in_flight",
          job: existing,
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    console.error("[ai-job-enqueue] insert failed:", insErr);
    return new Response(
      JSON.stringify({ error: "Failed to enqueue", details: insErr.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  return new Response(JSON.stringify({ job: inserted }), {
    status: 201,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
