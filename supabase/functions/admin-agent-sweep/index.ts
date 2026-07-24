// deno-lint-ignore-file no-explicit-any
/**
 * Admin Agent · Proactive scheduled sweep.
 *
 * Server-side equivalent of the Ask nAItive AI chat flow for
 * `verify_deal_information` + `record_admin_agent_selection`. Runs with
 * no chat session, for every workspace that has the Admin Agent
 * enabled. By default only runs on Fridays (ET) for companies whose
 * `admin_agent_settings.friday_sweep_enabled` is true. Pass
 * { "force": true } to bypass the day-of-week and friday-sweep checks
 * (used by pg_cron-free manual triggers and by the verification
 * curl below).
 *
 * For each flagged item it creates the same admin_agent_selected_actions
 * + ai_action_queue rows the chat path creates, so the Approval Queue
 * UI (badge + /pending-approval) surfaces them and approvals land tasks
 * in /tasks through the existing executeQueuedAction('create_task')
 * path. Idempotent within the current ISO week.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  auditPortfolio,
  loadAuditConfig,
  logAuditRun,
  isFridayET,
} from "../_shared/adminAgentAudit.ts";
import { enqueueAdminAgentSelections } from "../_shared/adminAgentQueue.ts";
import { runDealAdminAgentAnalysis } from "../_shared/dealAdminAgentIntelligence.ts";
import { rescheduleFollowupTasksForCompany } from "../_shared/rescheduleFollowupTasks.ts";
import {
  AGENT_KEYS,
  isAgentEnabledForCompany,
} from "../_shared/agentEntitlement.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Tunable caps to keep the sweep from flooding the Approval Queue.
const MAX_FLAGGED_PER_DEAL = 5;
const MAX_QUEUE_ROWS_PER_COMPANY = 50;

function startOfIsoWeekUtc(d: Date = new Date()): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = x.getUTCDay(); // 0..6, Sun=0
  const daysSinceMonday = (dow + 6) % 7;
  x.setUTCDate(x.getUTCDate() - daysSinceMonday);
  return x.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let body: any = {};
  try {
    if (req.method !== "GET") body = await req.json();
  } catch (_) {
    body = {};
  }
  const force = body?.force === true;
  const onlyCompanyId =
    typeof body?.company_id === "string" && body.company_id ? body.company_id : null;

  const now = new Date();
  const isFri = isFridayET(now);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Pull every company that has Admin Agent enabled.
  let settingsQ = supabase
    .from("admin_agent_settings")
    .select("company_id, enabled, friday_sweep_enabled")
    .eq("enabled", true);
  if (onlyCompanyId) settingsQ = settingsQ.eq("company_id", onlyCompanyId);

  const { data: settingsRows, error: settingsErr } = await settingsQ;
  if (settingsErr) {
    return new Response(
      JSON.stringify({ ok: false, error: `settings query: ${settingsErr.message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const companies = (settingsRows ?? []).filter((r: any) =>
    force || (isFri && r.friday_sweep_enabled === true)
  );

  const summary: any[] = [];

  for (const row of companies) {
    const companyId = row.company_id as string;
    const perCompany: any = {
      company_id: companyId,
      evaluated: 0,
      flagged: 0,
      new_selections: 0,
      new_queue_rows: 0,
      skipped_duplicates: 0,
      capped: 0,
      activated_user_count: 0,
      skipped_reason: null as string | null,
      audit_run_id: null as string | null,
      error: null as string | null,
    };

    try {
      // ── Company-level entitlement gate (master) ────────────────
      // The Admin Agent only runs for companies a platform admin has
      // explicitly enabled in company_agent_access. This sits ABOVE the
      // per-user activation gate below — if the company is not entitled,
      // we skip without doing any audit work, queue rows, or notifications.
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

      // ── Per-user activation gate (server-side enforcement) ─────
      // The Admin Agent is opt-in per user. Only process the sweep
      // for workspaces where at least one user has flipped the
      // `is_activated` flag in admin_agent_user_overrides. Selections
      // are attributed to the earliest activated user; deal-owner
      // assignment in enqueueAdminAgentSelections is restricted to
      // members of this set so deactivated users never receive
      // sweep-generated tasks or notifications.
      const { data: activatedRows, error: actErr } = await supabase
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
        (activatedRows ?? []).map((r: any) => r.user_id as string),
      );
      perCompany.activated_user_count = activatedUserIds.size;
      if (activatedUserIds.size === 0) {
        perCompany.skipped_reason = "no_activated_users";
        summary.push(perCompany);
        continue;
      }
      const ownerUserId = (activatedRows![0] as any).user_id as string;

      // 2) Load config + run portfolio audit with a large page so we see
      //    every flagged deal in one pass.
      const cfg = await loadAuditConfig(supabase, companyId);
      if (cfg.settings.enabled === false) continue;

      const result = await auditPortfolio(supabase, {
        companyId,
        cfg,
        offset: 0,
        pageSize: 500, // effectively unbounded for a sweep
        now,
      });
      perCompany.evaluated = result.total_evaluated;
      perCompany.flagged = result.total_flagged;

      // 3) Persist an audit_run row first so we can stamp every selection
      //    with its id (matches the chat path).
      const auditRunId = await logAuditRun(supabase, {
        companyId,
        userId: ownerUserId,
        scopeType: "portfolio",
        dealIds: (result as any)._evaluated_deal_ids ?? [],
        findingsSummary: {
          pipeline_id: result.pipeline_id,
          total_evaluated: result.total_evaluated,
          total_flagged: result.total_flagged,
          total_never_updated: result.total_never_updated,
          flagged_deal_ids: (result as any)._flagged_deal_ids ?? [],
          source: "cron",
          forced: force,
        },
        totalEvaluated: result.total_evaluated,
        totalFlagged: result.total_flagged,
        totalNeverUpdated: result.total_never_updated,
        triggeredBy: "friday_sweep",
      });
      perCompany.audit_run_id = auditRunId;

      if (result.total_flagged === 0) {
        summary.push(perCompany);
        continue;
      }

      // 4) Idempotency: skip any (deal_id, field, lender_id) that already
      //    has an open admin_agent_selected_actions row this ISO week.
      const weekStart = startOfIsoWeekUtc(now);
      const { data: existing } = await supabase
        .from("admin_agent_selected_actions")
        .select("deal_id, field, lender_id, status")
        .eq("company_id", companyId)
        .in("status", ["pending", "queued", "dismissed", "rejected"])
        .gte("created_at", weekStart);
      const dedupeKey = (d: string | null, f: string, l: string | null) =>
        `${d ?? ""}::${f}::${l ?? ""}`;
      const seen = new Set<string>(
        (existing ?? []).map((r: any) =>
          dedupeKey(r.deal_id, r.field, r.lender_id ?? null)
        ),
      );

      // 5) Build one selection row per flagged item per flagged deal.
      type FlatSel = {
        deal_id: string;
        deal_name: string;
        field: string;
        lender_id: string | null;
      };
      const flat: FlatSel[] = [];
      // Sort deals globally by stalest first to prioritize when we hit
      // the per-company cap.
      const sortedDeals = [...result.page].sort(
        (a, b) => (b.oldest_business_days ?? 0) - (a.oldest_business_days ?? 0),
      );
      for (const dealAudit of sortedDeals) {
        // Only consider may_need_review items (skip fresh + never-updated).
        const candidateItems = dealAudit.items
          .filter((it) => it.review_status === "may_need_review")
          .sort(
            (a, b) =>
              (b.business_days_since_last_update ?? 0) -
              (a.business_days_since_last_update ?? 0),
          );
        let perDealKept = 0;
        for (const it of candidateItems) {
          // Skip the funding_sources rollup — we attribute per lender,
          // which the chat path also uses. If there are no per-lender
          // items (e.g. no lenders), keep the rollup so the user still
          // gets a "no funding sources" task.
          if (it.field === "funding_sources") {
            const hasPerLender = dealAudit.items.some((x) =>
              x.field.startsWith("funding_source:")
            );
            if (hasPerLender) continue;
          }
          const field = it.field.startsWith("funding_source:")
            ? "funding_sources"
            : it.field;
          const lenderId =
            it.field.startsWith("funding_source:") ? it.field.split(":")[1] : null;
          const k = dedupeKey(dealAudit.deal_id, field, lenderId);
          if (seen.has(k)) {
            perCompany.skipped_duplicates++;
            continue;
          }
          // Apply caps: per-deal first, then global per-company.
          if (perDealKept >= MAX_FLAGGED_PER_DEAL) {
            perCompany.capped++;
            continue;
          }
          if (flat.length >= MAX_QUEUE_ROWS_PER_COMPANY) {
            perCompany.capped++;
            continue;
          }
          seen.add(k);
          perDealKept++;
          flat.push({
            deal_id: dealAudit.deal_id,
            deal_name: dealAudit.deal_name,
            field,
            lender_id: lenderId,
          });
        }
      }

      if (flat.length === 0) {
        summary.push(perCompany);
        continue;
      }

      // 6) Insert admin_agent_selected_actions in the same shape as the
      //    chat path: action='update', scope_level='field',
      //    confirmation_status='confirmed', status='pending'.
      const enqueueRes = await enqueueAdminAgentSelections({
        supabase,
        companyId,
        attributionUserId: ownerUserId,
        auditRunId,
        selections: flat.map((s) => ({
          deal_id: s.deal_id,
          deal_name: s.deal_name,
          field: s.field,
          lender_id: s.lender_id,
          action: "update",
          scope_level: "field",
          note: null,
        })),
        sourceMessage: "[admin-agent-sweep:cron]",
        rawUserResponse: null,
        fromCron: true,
        forced: force,
        emitNotifications: true,
        activatedUserIds,
      });
      if (enqueueRes.error) {
        perCompany.error = enqueueRes.error;
        summary.push(perCompany);
        continue;
      }
      perCompany.new_selections = enqueueRes.inserted_selections;
      perCompany.new_queue_rows = enqueueRes.inserted_queue_rows;
      (perCompany as any).notifications_sent = enqueueRes.notifications_sent;

      // ── Phase 2: cross-source executable intelligence pass ──────
      // Generates executable Approval Queue items (stage moves, status
      // notes, funding-source updates, milestones, follow-up tasks,
      // email drafts) from emails/calendar/activity/notes/etc.
      try {
        const intel = await runDealAdminAgentAnalysis({
          supabase,
          companyId,
          attributionUserId: ownerUserId,
          activatedUserIds,
          source: "cron",
          maxDeals: 25,
          maxQueueRows: 40,
          minConfidence: 0.65,
        });
        (perCompany as any).intelligence = {
          evaluated: intel.evaluated_deals,
          proposed: intel.candidates_proposed,
          filtered: intel.candidates_filtered,
          merged: intel.candidates_merged,
          inserted: intel.queue_rows_inserted,
          errors: intel.errors.length,
        };
        perCompany.new_queue_rows += intel.queue_rows_inserted;
      } catch (e) {
        (perCompany as any).intelligence_error = (e as Error)?.message ?? "unknown";
      }

      // Deterministic follow-up task auto-reschedule (runs every sweep for
      // every activated user; independent of the LLM pass).
      try {
        const reschedule = await rescheduleFollowupTasksForCompany({
          supabase,
          companyId,
          activatedUserIds: Array.from(activatedUserIds ?? []),
        });
        (perCompany as any).reschedule = {
          scanned: reschedule.scanned_tasks,
          matched: reschedule.matched_tasks,
          rescheduled: reschedule.rescheduled_tasks,
          skipped_already_future: reschedule.skipped_already_future,
          errors: reschedule.errors.length,
        };
      } catch (e) {
        (perCompany as any).reschedule_error = (e as Error)?.message ?? "unknown";
      }
    } catch (e) {
      perCompany.error = (e as Error)?.message ?? "unknown error";
      console.error("[admin-agent-sweep] company failed:", companyId, e);
    }

    summary.push(perCompany);
  }

  const totals = summary.reduce(
    (acc, s) => {
      acc.companies++;
      if (s.skipped_reason === "company_not_enabled") acc.skipped_company_not_enabled++;
      if (s.skipped_reason === "no_activated_users") acc.skipped_no_activated_users++;
      acc.evaluated += s.evaluated || 0;
      acc.flagged += s.flagged || 0;
      acc.new_selections += s.new_selections || 0;
      acc.new_queue_rows += s.new_queue_rows || 0;
      acc.skipped_duplicates += s.skipped_duplicates || 0;
      acc.capped += s.capped || 0;
      if (s.error) acc.errors++;
      return acc;
    },
    {
      companies: 0,
      skipped_company_not_enabled: 0,
      skipped_no_activated_users: 0,
      evaluated: 0,
      flagged: 0,
      new_selections: 0,
      new_queue_rows: 0,
      skipped_duplicates: 0,
      capped: 0,
      errors: 0,
    },
  );

  return new Response(
    JSON.stringify({
      ok: true,
      ran_at: now.toISOString(),
      is_friday_et: isFri,
      forced: force,
      caps: {
        max_flagged_per_deal: MAX_FLAGGED_PER_DEAL,
        max_queue_rows_per_company: MAX_QUEUE_ROWS_PER_COMPANY,
        bucket: "may_need_review",
      },
      totals,
      per_company: summary,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});