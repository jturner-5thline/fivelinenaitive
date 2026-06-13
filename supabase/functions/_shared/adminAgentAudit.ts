// deno-lint-ignore-file no-explicit-any
/**
 * Admin Agent · Duty 1 — Verify Deal Information.
 *
 * Shared, dependency-free audit engine used by the Ask nAItive AI chat
 * (supabase/functions/copilot-chat) and any future scheduler/sweep
 * workers. Mirrors the spec in mem://features/admin-agent/.
 *
 * Inputs are pure; outputs are typed and self-describing so the chat
 * model can render findings without inferring shape.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// ── Types (mirror src/lib/adminAgent/types.ts) ──────────────────
export type ReviewStatus =
  | "fresh"
  | "may_need_review"
  | "no_post_creation_update_recorded";

export type CriticalField =
  | "status" | "stage" | "milestones" | "status_notes" | "funding_sources";

export interface AdminAgentSettingsRow {
  company_id: string;
  enabled: boolean;
  active_pipeline_ids: string[];
  active_stage_ids: string[];
  critical_fields: CriticalField[];
  stale_threshold_business_days: number;
  friday_sweep_enabled: boolean;
  default_chat_behavior: {
    portfolio_page_size: number;
    show_more: boolean;
    ask_before_writes: boolean;
    group_by: "deal" | "field";
  };
  advisory_tone: boolean;
}

export interface AuditConfig {
  settings: AdminAgentSettingsRow;
  /** Union of US federal holidays + company-defined holidays. */
  holidays: ReadonlySet<string>;
  /** Resolved default/active pipeline ID if settings.active_pipeline_ids was empty. */
  resolved_pipeline_ids: string[];
}

export interface ItemFinding {
  field: string;
  label: string;
  last_updated_at: string | null;
  created_at: string | null;
  business_days_since_last_update: number | null;
  has_post_creation_update: boolean;
  review_status: ReviewStatus;
  detail?: string;
  lender_id?: string;
}

export interface DealAudit {
  deal_id: string;
  deal_name: string;
  pipeline_id: string | null;
  stage: string | null;
  status: string | null;
  items: ItemFinding[];
  flagged_count: number;
  never_updated_count: number;
  oldest_business_days: number;
}

// ── Holiday + business-day helpers ──────────────────────────────
function pad(n: number) { return n < 10 ? `0${n}` : String(n); }
function ymd(y: number, m: number, d: number) { return `${y}-${pad(m)}-${pad(d)}`; }
function observed(y: number, m: number, d: number): string {
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay();
  if (dow === 6) return ymd(y, m, d - 1);
  if (dow === 0) return ymd(y, m, d + 1);
  return ymd(y, m, d);
}
function nthWeekday(y: number, m: number, weekday: number, n: number): string {
  const first = new Date(Date.UTC(y, m - 1, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return ymd(y, m, 1 + offset + (n - 1) * 7);
}
function lastWeekday(y: number, m: number, weekday: number): string {
  const last = new Date(Date.UTC(y, m, 0));
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return ymd(y, m, last.getUTCDate() - offset);
}
function usFederalHolidaysForYear(y: number): string[] {
  return [
    observed(y, 1, 1),
    nthWeekday(y, 1, 1, 3),
    nthWeekday(y, 2, 1, 3),
    lastWeekday(y, 5, 1),
    observed(y, 6, 19),
    observed(y, 7, 4),
    nthWeekday(y, 9, 1, 1),
    nthWeekday(y, 10, 1, 2),
    observed(y, 11, 11),
    nthWeekday(y, 11, 4, 4),
    observed(y, 12, 25),
  ];
}

const US_FEDERAL_HOLIDAYS: ReadonlySet<string> = new Set(
  [2024, 2025, 2026, 2027, 2028, 2029, 2030].flatMap(usFederalHolidaysForYear),
);

export function businessDaysBetween(
  from: Date,
  to: Date,
  holidays: ReadonlySet<string>,
): number {
  const start = new Date(from); start.setHours(0, 0, 0, 0);
  const end = new Date(to); end.setHours(0, 0, 0, 0);
  if (end <= start) return 0;
  let count = 0;
  const cursor = new Date(start);
  cursor.setDate(cursor.getDate() + 1);
  while (cursor <= end) {
    const dow = cursor.getDay();
    const key = ymd(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate());
    if (dow !== 0 && dow !== 6 && !holidays.has(key)) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

export function isFridayET(d: Date = new Date()): boolean {
  // Use local server day-of-week; close enough for sweep semantics.
  return d.getDay() === 5;
}

// ── Config loader ────────────────────────────────────────────────
export async function loadAuditConfig(
  supabase: SupabaseClient,
  companyId: string,
): Promise<AuditConfig> {
  const [settingsRes, holidaysRes, pipelinesRes] = await Promise.all([
    supabase.from("admin_agent_settings").select("*").eq("company_id", companyId).maybeSingle(),
    supabase.from("admin_agent_holidays").select("holiday_date").eq("company_id", companyId),
    supabase.from("deal_pipelines").select("id, is_default").eq("company_id", companyId),
  ]);

  const defaults: AdminAgentSettingsRow = {
    company_id: companyId,
    enabled: true,
    active_pipeline_ids: [],
    active_stage_ids: [],
    critical_fields: ["status", "stage", "milestones", "status_notes", "funding_sources"],
    stale_threshold_business_days: 3,
    friday_sweep_enabled: true,
    default_chat_behavior: {
      portfolio_page_size: 3,
      show_more: true,
      ask_before_writes: true,
      group_by: "deal",
    },
    advisory_tone: true,
  };
  const settings: AdminAgentSettingsRow = settingsRes.data
    ? { ...defaults, ...(settingsRes.data as any) }
    : defaults;

  const extraDates = new Set<string>(US_FEDERAL_HOLIDAYS);
  for (const row of (holidaysRes.data || []) as any[]) {
    if (typeof row.holiday_date === "string") extraDates.add(row.holiday_date);
  }

  let resolvedPipelineIds = settings.active_pipeline_ids;
  if (!resolvedPipelineIds || resolvedPipelineIds.length === 0) {
    const pipelines = (pipelinesRes.data || []) as any[];
    const def = pipelines.find((p) => p.is_default) ?? pipelines[0];
    resolvedPipelineIds = def ? [def.id] : [];
  }

  return { settings, holidays: extraDates, resolved_pipeline_ids: resolvedPipelineIds };
}

// ── Per-item helpers ─────────────────────────────────────────────
function buildItem(
  field: string,
  label: string,
  lastUpdated: string | null | undefined,
  createdAt: string | null | undefined,
  now: Date,
  cfg: AuditConfig,
  detail?: string,
  extras?: Partial<ItemFinding>,
): ItemFinding {
  const created = createdAt ? new Date(createdAt) : null;
  const last = lastUpdated ? new Date(lastUpdated) : null;
  const hasUpdate = !!last && (!created || Math.abs(last.getTime() - created.getTime()) >= 2000);

  if (!hasUpdate) {
    return {
      field,
      label,
      last_updated_at: last ? last.toISOString() : null,
      created_at: created ? created.toISOString() : null,
      business_days_since_last_update: null,
      has_post_creation_update: false,
      review_status: "no_post_creation_update_recorded",
      detail,
      ...extras,
    };
  }
  const bd = businessDaysBetween(last!, now, cfg.holidays);
  return {
    field,
    label,
    last_updated_at: last!.toISOString(),
    created_at: created ? created.toISOString() : null,
    business_days_since_last_update: bd,
    has_post_creation_update: true,
    review_status: bd > cfg.settings.stale_threshold_business_days ? "may_need_review" : "fresh",
    detail,
    ...extras,
  };
}

// ── Single-deal audit ───────────────────────────────────────────
export async function auditDeal(
  supabase: SupabaseClient,
  deal: {
    id: string;
    company: string;
    pipeline_id: string | null;
    stage: string | null;
    status: string | null;
    created_at: string;
    updated_at: string;
  },
  cfg: AuditConfig,
  now: Date = new Date(),
): Promise<DealAudit> {
  const dealId = deal.id;
  const [statusNotesRes, milestonesRes, lendersRes, stageHistRes] = await Promise.all([
    supabase.from("deal_status_notes").select("created_at").eq("deal_id", dealId)
      .order("created_at", { ascending: false }).limit(1),
    supabase.from("deal_milestones").select("updated_at, created_at, title").eq("deal_id", dealId)
      .order("updated_at", { ascending: false }),
    supabase.from("deal_lenders").select(
      "id, name, stage, tracking_status, updated_at, created_at, last_status_change_at, last_contact_at, is_archived",
    ).eq("deal_id", dealId),
    supabase.from("deal_stage_history").select("changed_at").eq("deal_id", dealId)
      .order("changed_at", { ascending: false }).limit(1),
  ]);

  const items: ItemFinding[] = [];
  const fields = new Set(cfg.settings.critical_fields);

  if (fields.has("status")) {
    items.push(buildItem("status", "Deal Status", deal.updated_at, deal.created_at, now, cfg,
      `Current: ${deal.status ?? "—"}`));
  }
  if (fields.has("stage")) {
    const lastStageAt = (stageHistRes.data?.[0] as any)?.changed_at ?? deal.updated_at;
    items.push(buildItem("stage", "Deal Stage", lastStageAt, deal.created_at, now, cfg,
      `Current: ${deal.stage ?? "—"}`));
  }
  if (fields.has("milestones")) {
    const milestones = (milestonesRes.data || []) as any[];
    if (milestones.length === 0) {
      items.push({
        field: "milestones", label: "Milestones",
        last_updated_at: null, created_at: null,
        business_days_since_last_update: null, has_post_creation_update: false,
        review_status: "no_post_creation_update_recorded",
        detail: "No milestones created",
      });
    } else {
      const newest = milestones[0];
      items.push(buildItem("milestones", "Milestones", newest.updated_at, newest.created_at, now, cfg,
        `${milestones.length} milestone(s); newest: "${newest.title}"`));
    }
  }
  if (fields.has("status_notes")) {
    const latestNote = (statusNotesRes.data?.[0] as any)?.created_at ?? null;
    if (!latestNote) {
      items.push({
        field: "status_notes", label: "Status Notes",
        last_updated_at: null, created_at: null,
        business_days_since_last_update: null, has_post_creation_update: false,
        review_status: "no_post_creation_update_recorded",
        detail: "No status notes recorded",
      });
    } else {
      items.push(buildItem("status_notes", "Status Notes", latestNote, null, now, cfg));
    }
  }
  if (fields.has("funding_sources")) {
    const lenders = ((lendersRes.data || []) as any[]).filter((l) => l.is_archived !== true);
    if (lenders.length === 0) {
      items.push({
        field: "funding_sources", label: "Funding Sources",
        last_updated_at: null, created_at: null,
        business_days_since_last_update: null, has_post_creation_update: false,
        review_status: "no_post_creation_update_recorded",
        detail: "No funding sources added",
      });
    } else {
      const perLender: ItemFinding[] = lenders.map((l) => {
        const lastTouch = l.last_status_change_at || l.updated_at || l.last_contact_at || l.created_at;
        return buildItem(
          `funding_source:${l.id}`,
          l.name || "Lender",
          lastTouch,
          l.created_at,
          now,
          cfg,
          `Stage: ${l.stage ?? "—"}${l.tracking_status ? ` · ${l.tracking_status}` : ""}`,
          { lender_id: l.id },
        );
      });
      const staleLenders = perLender.filter((r) => r.review_status !== "fresh");
      const rollupReview: ReviewStatus = staleLenders.length === 0
        ? "fresh"
        : (staleLenders.every((r) => r.review_status === "no_post_creation_update_recorded")
            ? "no_post_creation_update_recorded"
            : "may_need_review");
      const rollupLast = perLender.reduce<string | null>((acc, r) =>
        !r.last_updated_at ? acc : (!acc || r.last_updated_at > acc ? r.last_updated_at : acc), null);
      const rollupBd = perLender.reduce<number | null>((acc, r) =>
        r.business_days_since_last_update == null ? acc
          : (acc == null || r.business_days_since_last_update < acc ? r.business_days_since_last_update : acc), null);
      items.push({
        field: "funding_sources",
        label: "Funding Sources",
        last_updated_at: rollupLast,
        created_at: null,
        business_days_since_last_update: rollupBd,
        has_post_creation_update: perLender.some((r) => r.has_post_creation_update),
        review_status: rollupReview,
        detail: `${lenders.length} funding source(s); ${staleLenders.length} may need review`,
      });
      // Per-lender breakdown follows the rollup so the chat can cite each.
      items.push(...perLender);
    }
  }

  const flagged_count = items.filter((i) => i.review_status !== "fresh").length;
  const never_updated_count = items.filter((i) => i.review_status === "no_post_creation_update_recorded").length;
  const oldest_business_days = items
    .map((i) => i.business_days_since_last_update)
    .filter((v): v is number => typeof v === "number")
    .reduce((m, v) => (v > m ? v : m), 0);

  return {
    deal_id: dealId,
    deal_name: deal.company,
    pipeline_id: deal.pipeline_id,
    stage: deal.stage,
    status: deal.status,
    items,
    flagged_count,
    never_updated_count,
    oldest_business_days,
  };
}

// ── Portfolio audit ─────────────────────────────────────────────
export interface PortfolioAuditOptions {
  companyId: string;
  cfg: AuditConfig;
  offset?: number;
  pageSize?: number;
  now?: Date;
}

const TERMINAL_STAGES = new Set(["closed-won", "closed-lost", "on-hold", "passed"]);
const TERMINAL_STATUSES = new Set(["closed", "on-hold", "archived", "closed-won", "closed-lost"]);

function isGloballyExcludedDealName(name?: string | null): boolean {
  const x = (name || "").toLowerCase().trim();
  if (!x) return false;
  if (x === "example deal" || x === "test - niki's store" || x === "test-niki's store") return true;
  if (x === "test" || x.startsWith("test ")) return true;
  return false;
}

export async function auditPortfolio(
  supabase: SupabaseClient,
  opts: PortfolioAuditOptions,
) {
  const now = opts.now ?? new Date();
  const pageSize = opts.pageSize ?? opts.cfg.settings.default_chat_behavior.portfolio_page_size ?? 3;
  const offset = Math.max(0, opts.offset ?? 0);

  let q = supabase.from("deals")
    .select("id, company, stage, status, pipeline_id, created_at, updated_at, is_archived")
    .eq("company_id", opts.companyId)
    .neq("is_archived", true);
  if (opts.cfg.resolved_pipeline_ids.length > 0) {
    q = q.in("pipeline_id", opts.cfg.resolved_pipeline_ids);
  }
  if (opts.cfg.settings.active_stage_ids.length > 0) {
    q = q.in("stage", opts.cfg.settings.active_stage_ids);
  } else {
    q = q.not("stage", "in", `(${Array.from(TERMINAL_STAGES).map((s) => `"${s}"`).join(",")})`);
  }
  q = q.not("status", "in", `(${Array.from(TERMINAL_STATUSES).map((s) => `"${s}"`).join(",")})`);

  const { data, error } = await q.limit(500);
  if (error) throw new Error(`auditPortfolio: ${error.message}`);
  const deals = (data || []).filter((d: any) => !isGloballyExcludedDealName(d.company));

  const audits = await Promise.all(deals.map((d: any) => auditDeal(supabase, d, opts.cfg, now)));
  const flagged = audits
    .filter((a) => a.flagged_count > 0)
    .sort((a, b) =>
      (b.oldest_business_days - a.oldest_business_days) || (b.flagged_count - a.flagged_count));

  const page = flagged.slice(offset, offset + pageSize);
  const total_never_updated = flagged.filter((a) => a.never_updated_count > 0).length;

  return {
    mode: "portfolio" as const,
    audited_at: now.toISOString(),
    pipeline_id: opts.cfg.resolved_pipeline_ids[0] ?? null,
    stale_threshold_business_days: opts.cfg.settings.stale_threshold_business_days,
    total_evaluated: audits.length,
    total_clean: audits.length - flagged.length,
    total_flagged: flagged.length,
    total_never_updated,
    total_stale_only: flagged.length - total_never_updated,
    page,
    show_more_available: flagged.length > offset + page.length,
    next_offset: flagged.length > offset + page.length ? offset + page.length : null,
    friday_sweep: opts.cfg.settings.friday_sweep_enabled && isFridayET(now),
    /** Every deal evaluated, used for audit-run logging. */
    _evaluated_deal_ids: audits.map((a) => a.deal_id),
    _flagged_deal_ids: flagged.map((a) => a.deal_id),
  };
}

// ── Audit-run logging ───────────────────────────────────────────
export interface LogAuditRunInput {
  companyId: string;
  userId: string | null;
  scopeType: "portfolio" | "single_deal";
  dealIds: string[];
  findingsSummary: Record<string, unknown>;
  totalEvaluated: number;
  totalFlagged: number;
  totalNeverUpdated: number;
  triggeredBy?: "chat" | "friday_sweep" | "manual" | "scheduled";
}

/**
 * Insert one row into admin_agent_audit_runs. Best-effort: failures
 * are logged but never throw — auditing must never block chat replies.
 * Returns the new row id, or null on failure.
 */
export async function logAuditRun(
  supabase: SupabaseClient,
  input: LogAuditRunInput,
): Promise<string | null> {
  try {
    const { data, error } = await supabase.from("admin_agent_audit_runs").insert({
      company_id: input.companyId,
      user_id: input.userId,
      scope_type: input.scopeType,
      deal_ids: input.dealIds,
      findings_summary: input.findingsSummary,
      total_evaluated: input.totalEvaluated,
      total_flagged: input.totalFlagged,
      total_never_updated: input.totalNeverUpdated,
      triggered_by: input.triggeredBy ?? "chat",
    }).select("id").single();
    if (error) {
      console.warn("[admin_agent] logAuditRun failed:", error.message);
      return null;
    }
    return (data as any)?.id ?? null;
  } catch (e) {
    console.warn("[admin_agent] logAuditRun exception:", e);
    return null;
  }
}
