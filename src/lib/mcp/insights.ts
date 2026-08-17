/**
 * Shared helpers for the Insights MCP tools.
 *
 * Keep this import-safe: function definitions only, no env reads or I/O at
 * module scope (the MCP entry is evaluated at build time and on cold start).
 */

/** Global test-deal exclusions — mirrors the rule applied across the app UI. */
const EXCLUDED_EXACT = new Set(["test-niki's store", "example deal"]);

export function isExcludedDealName(name: string | null | undefined): boolean {
  const n = (name ?? "").trim().toLowerCase();
  if (!n) return false;
  if (EXCLUDED_EXACT.has(n)) return true;
  return n.startsWith("test ");
}

export function monthKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function sum(values: Array<number | null | undefined>): number {
  return values.reduce<number>((acc, v) => acc + (Number(v) || 0), 0);
}

export function groupAggregate<T>(
  rows: T[],
  keyOf: (row: T) => string,
  valueOf: (row: T) => number,
): Array<{ key: string; count: number; total_value: number }> {
  const map = new Map<string, { key: string; count: number; total_value: number }>();
  for (const row of rows) {
    const key = keyOf(row) || "unknown";
    const entry = map.get(key) ?? { key, count: 0, total_value: 0 };
    entry.count += 1;
    entry.total_value += Number(valueOf(row)) || 0;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => b.total_value - a.total_value);
}

/** Tables the generic `query_insights_dataset` tool may read (read-only, RLS-scoped). */
export const INSIGHTS_DATASETS = [
  "deals",
  "deal_lenders",
  "deal_pipelines",
  "deal_stage_history",
  "deal_milestones",
  "deal_computed_metrics",
  "deal_stage_durations",
  "deal_stage_transitions",
  "outstanding_items",
  "tasks",
  "activity_logs",
  "contacts",
  "crm_companies",
  "master_lenders",
  "custom_metrics",
  "insights_metric_targets",
  "metric_manual_inputs",
  "dashboard_grid_layouts",
  "dashboard_layouts",
  "quickbooks_invoices",
  "quickbooks_customers",
  "quickbooks_payments",
  "quickbooks_expenses",
  "quickbooks_bills",
  "quickbooks_reports",
  "qbo_pnl_snapshots",
  "qbo_cashflow_snapshots",
  "claap_meetings",
  "team_interaction_metrics",
] as const;

export type InsightsDataset = (typeof INSIGHTS_DATASETS)[number];
