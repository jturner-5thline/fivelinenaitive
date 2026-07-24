// deno-lint-ignore-file no-explicit-any
/**
 * Deal Admin Agent · manual test scan.
 *
 * Runs the cross-source intelligence engine immediately for a specific
 * Deal Manager (deal_owner_user_id) and returns the Approval Queue rows
 * that WOULD be created — without writing to ai_action_queue.
 *
 * Intended for verification / debugging. Requires an authenticated caller
 * who is a member of the same company as the target Deal Manager.
 *
 * Body:
 *   {
 *     deal_manager_user_id: string   // required
 *     company_id?: string            // optional override; defaults to caller's company
 *     deal_ids?: string[]            // optional restrict to specific deals
 *     max_deals?: number             // default 10
 *     max_queue_rows?: number        // default 25
 *     min_confidence?: number        // default 0.6
 *   }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { runDealAdminAgentAnalysis } from "../_shared/dealAdminAgentIntelligence.ts";
import { rescheduleFollowupTasksForCompany } from "../_shared/rescheduleFollowupTasks.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Auth — verify caller.
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const callerId = userData.user.id;

  let body: any = {};
  try {
    body = await req.json();
  } catch (_) {
    body = {};
  }

  const dealManagerId: string | null =
    typeof body?.deal_manager_user_id === "string" && body.deal_manager_user_id
      ? body.deal_manager_user_id
      : null;
  if (!dealManagerId) {
    return new Response(
      JSON.stringify({ error: "deal_manager_user_id is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Resolve company: prefer explicit override but verify caller membership.
  let companyId: string | null =
    typeof body?.company_id === "string" && body.company_id ? body.company_id : null;

  // Caller's companies.
  const { data: callerMemberships, error: cmErr } = await admin
    .from("company_members")
    .select("company_id")
    .eq("user_id", callerId);
  if (cmErr) {
    return new Response(
      JSON.stringify({ error: `membership lookup: ${cmErr.message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const callerCompanies = new Set<string>(
    (callerMemberships ?? []).map((r: any) => r.company_id as string),
  );

  // Deal manager's companies.
  const { data: dmMemberships } = await admin
    .from("company_members")
    .select("company_id")
    .eq("user_id", dealManagerId);
  const dmCompanies = new Set<string>(
    (dmMemberships ?? []).map((r: any) => r.company_id as string),
  );

  if (companyId) {
    if (!callerCompanies.has(companyId) || !dmCompanies.has(companyId)) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } else {
    // Use first shared company.
    const shared = [...callerCompanies].find((c) => dmCompanies.has(c));
    if (!shared) {
      return new Response(
        JSON.stringify({ error: "caller and deal manager share no company" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    companyId = shared;
  }

  const maxDeals: number = typeof body?.max_deals === "number" ? body.max_deals : 10;
  const maxQueueRows: number =
    typeof body?.max_queue_rows === "number" ? body.max_queue_rows : 25;
  const minConfidence: number =
    typeof body?.min_confidence === "number" ? body.min_confidence : 0.6;
  const dealIds: string[] | undefined = Array.isArray(body?.deal_ids)
    ? body.deal_ids.filter((x: any) => typeof x === "string")
    : undefined;

  const startedAt = new Date();
  try {
    const intel = await runDealAdminAgentAnalysis({
      supabase: admin,
      companyId: companyId!,
      attributionUserId: dealManagerId,
      activatedUserIds: new Set<string>([dealManagerId]),
      source: "manual",
      maxDeals,
      maxQueueRows,
      minConfidence,
      dealIds,
      dryRun: true,
    });

    // Deterministic follow-up reschedule: if a follow-up-style task's
    // assignee already sent an email tied to the deal today (ET), push the
    // task's due_date to today+2 business days. This runs live (not
    // dry-run) because it's a direct UPDATE, not a queue proposal.
    const reschedule = await rescheduleFollowupTasksForCompany({
      supabase: admin,
      companyId: companyId!,
      activatedUserIds: [dealManagerId],
    });

    return new Response(
      JSON.stringify({
        ok: true,
        dry_run: true,
        ran_at: startedAt.toISOString(),
        company_id: companyId,
        deal_manager_user_id: dealManagerId,
        summary: {
          evaluated_deals: intel.evaluated_deals,
          candidates_proposed: intel.candidates_proposed,
          candidates_filtered: intel.candidates_filtered,
          candidates_merged: intel.candidates_merged,
          would_insert: intel.queue_rows_inserted,
          reschedule,
        },
        errors: intel.errors ?? [],
        preview_rows: intel.preview_rows ?? [],
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[deal-admin-agent-test-scan] failed:", e);
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error)?.message ?? "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});