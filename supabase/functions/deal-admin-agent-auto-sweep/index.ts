// deno-lint-ignore-file no-explicit-any
/**
 * Deal Admin Agent · automatic background sweep.
 *
 * Runs the cross-source intelligence pass (runDealAdminAgentAnalysis)
 * for every workspace that has the Admin Agent enabled and at least one
 * activated user. Deal scope is gated by **Deal Manager** (resolved
 * via deals.manager text → profiles), not deal_owner_user_id alone.
 * Designed to be invoked by pg_cron every couple of
 * hours so Approval Queue items appear automatically — users never need
 * to click "Analyze now".
 *
 * Unlike admin-agent-sweep this function does NOT run the legacy
 * portfolio audit / reminder generator. It only emits executable
 * intelligence-engine items.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { runDealAdminAgentAnalysis } from "../_shared/dealAdminAgentIntelligence.ts";
import { AGENT_KEYS, isAgentEnabledForCompany } from "../_shared/agentEntitlement.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// EdgeRuntime is provided by the Supabase Edge Runtime; declare so TS is happy.
// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: any;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let body: any = {};
  try {
    if (req.method !== "GET") body = await req.json();
  } catch (_) {
    body = {};
  }
  const onlyCompanyId: string | null =
    typeof body?.company_id === "string" && body.company_id ? body.company_id : null;
  const dealIds: string[] | undefined =
    typeof body?.deal_id === "string" ? [body.deal_id] :
    Array.isArray(body?.deal_ids) && body.deal_ids.length > 0 ? body.deal_ids :
    undefined;
  const maxDeals: number = typeof body?.max_deals === "number" ? body.max_deals : 25;
  const maxQueueRows: number = typeof body?.max_queue_rows === "number" ? body.max_queue_rows : 40;
  const minConfidence: number =
    typeof body?.min_confidence === "number" ? body.min_confidence : 0.65;
  // When true, the sweep runs the specified companies inline (blocking).
  // When false (default cron path with no company_id), the sweep fans out
  // one self-invocation per enabled company so each gets its own 150s
  // request budget and the top-level call returns instantly.
  const inline: boolean = body?.inline === true || !!onlyCompanyId;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let settingsQ = supabase
    .from("admin_agent_settings")
    .select("company_id, enabled")
    .eq("enabled", true);
  if (onlyCompanyId) settingsQ = settingsQ.eq("company_id", onlyCompanyId);
  const { data: settingsRows, error: settingsErr } = await settingsQ;
  if (settingsErr) {
    return new Response(
      JSON.stringify({ ok: false, error: `settings query: ${settingsErr.message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Fan-out mode: dispatch one background invocation per company so each
  // company gets its own 150s edge-function budget. This prevents a broad
  // scan from timing out after ~15 companies as it did previously.
  if (!inline) {
    const companies = (settingsRows ?? []).map((r: any) => r.company_id as string);
    const selfUrl = `${SUPABASE_URL}/functions/v1/deal-admin-agent-auto-sweep`;
    const dispatched: string[] = [];
    for (const cid of companies) {
      const p = fetch(selfUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE}`,
          apikey: SERVICE_ROLE,
        },
        body: JSON.stringify({
          company_id: cid,
          inline: true,
          deal_ids: dealIds,
          max_deals: maxDeals,
          max_queue_rows: maxQueueRows,
          min_confidence: minConfidence,
        }),
      }).catch((e) => {
        console.error("[deal-admin-agent-auto-sweep] fan-out failed:", cid, e);
      });
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
        EdgeRuntime.waitUntil(p);
      }
      dispatched.push(cid);
    }
    return new Response(
      JSON.stringify({
        ok: true,
        mode: "fanout",
        dispatched_companies: dispatched.length,
        company_ids: dispatched,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const startedAt = new Date();
  const summary: any[] = [];

  const runInline = async () => {
  for (const row of settingsRows ?? []) {
    const companyId = (row as any).company_id as string;
    const perCompany: any = {
      company_id: companyId,
      evaluated: 0,
      proposed: 0,
      filtered: 0,
      merged: 0,
      inserted: 0,
      skipped_reason: null as string | null,
      error: null as string | null,
    };

    try {
      const companyEnabled = await isAgentEnabledForCompany(
        supabase,
        companyId,
        AGENT_KEYS.ADMIN_AGENT,
      );
      if (!companyEnabled) {
        perCompany.skipped_reason = "company_not_enabled";
        summary.push(perCompany);
        continue;
      }

      const { data: actRows, error: actErr } = await supabase
        .from("admin_agent_user_overrides")
        .select("user_id, created_at")
        .eq("company_id", companyId)
        .eq("is_activated", true)
        .order("created_at", { ascending: true });
      if (actErr) {
        perCompany.error = `activated users query: ${actErr.message}`;
        summary.push(perCompany);
        continue;
      }
      const activatedUserIds = new Set<string>(
        (actRows ?? []).map((r: any) => r.user_id as string),
      );
      if (activatedUserIds.size === 0) {
        perCompany.skipped_reason = "no_activated_users";
        summary.push(perCompany);
        continue;
      }
      const attributionUserId = (actRows![0] as any).user_id as string;

      const intel = await runDealAdminAgentAnalysis({
        supabase,
        companyId,
        attributionUserId,
        activatedUserIds,
        source: "cron",
        maxDeals,
        maxQueueRows,
        minConfidence,
        dealIds,
      });
      perCompany.evaluated = intel.evaluated_deals;
      perCompany.proposed = intel.candidates_proposed;
      perCompany.filtered = intel.candidates_filtered;
      perCompany.merged = intel.candidates_merged;
      perCompany.inserted = intel.queue_rows_inserted;
      perCompany.auto_resolved = intel.auto_resolved_pending ?? 0;
      if (intel.errors?.length) {
        (perCompany as any).errors = intel.errors.slice(0, 5);
      }
    } catch (e) {
      perCompany.error = (e as Error)?.message ?? "unknown";
      console.error("[deal-admin-agent-auto-sweep] company failed:", companyId, e);
    }

    summary.push(perCompany);
  }
  };

  // Run the (potentially minutes-long) per-company analysis as a background
  // task so the request never hits the ~150s gateway wall-clock limit (504).
  // Callers that need the full result can pass { await_result: true }.
  const awaitResult: boolean = body?.await_result === true;
  if (!awaitResult && typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(
      runInline().catch((e) =>
        console.error("[deal-admin-agent-auto-sweep] background run failed:", e),
      ),
    );
    return new Response(
      JSON.stringify({
        ok: true,
        mode: "background",
        accepted_companies: (settingsRows ?? []).length,
        ran_at: startedAt.toISOString(),
      }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  await runInline();

  const totals = summary.reduce(
    (acc, s) => {
      acc.companies++;
      acc.evaluated += s.evaluated || 0;
      acc.inserted += s.inserted || 0;
      if (s.error) acc.errors++;
      return acc;
    },
    { companies: 0, evaluated: 0, inserted: 0, errors: 0 },
  );

  return new Response(
    JSON.stringify({
      ok: true,
      ran_at: startedAt.toISOString(),
      totals,
      per_company: summary,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});