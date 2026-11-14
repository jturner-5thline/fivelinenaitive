/**
 * Mirror of the database milestone automation (trg_deal_milestone_automation,
 * migration 0073). The database is authoritative; this module documents the
 * rules and is checked against the SQL by milestoneProjection.test.ts.
 */
export const MILESTONE_TRIM = 0.1;
export const MILESTONE_WINDOW_MONTHS = 24;
export const MIN_SAMPLES = 3;
export const PROJECTION_BASE_STAGE = "pre-credit-needs";

export const MILESTONE_RULES = [
  { title: "Client Signed", stage: "final-credit-items", fallbackDays: 20 },
  { title: "First Term Sheets", stage: "terms-issued", fallbackDays: 58 },
  { title: "Term Sheet Signed", stage: "in-due-diligence", fallbackDays: 120 },
] as const;

export function trimmedMean(values: number[], trim = MILESTONE_TRIM): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  const n = v.length;
  if (!n) return null;
  const cut = Math.floor(n * trim);
  const kept = v.slice(cut, n - cut);
  return kept.reduce((s, x) => s + x, 0) / kept.length;
}

export function projectionDays(stage: string, samples: number[]): number | null {
  const rule = MILESTONE_RULES.find((r) => r.stage === stage);
  if (!rule) return null;
  if (samples.length < MIN_SAMPLES) return rule.fallbackDays;
  return Math.round(trimmedMean(samples) as number);
}

export function milestoneCompletedByStage(stage: string): string | null {
  return MILESTONE_RULES.find((r) => r.stage === stage)?.title ?? null;
}

export interface MilestoneState { due_date: string | null; completed: boolean }

/** Only open milestones without a due date are filled; manual dates are preserved. */
export function nextDueDate(existing: MilestoneState | null, projected: string): string | null {
  if (!existing) return projected;
  if (existing.completed || existing.due_date) return existing.due_date;
  return projected;
}
