import { NDA_ONWARD_STAGE_ORDER } from "./referralNdaEntry";

/** Minimum NDA-cohort deals a source needs before it is ranked. */
export const MIN_CONVERSION_DEALS = 2;

export interface ConversionDeal {
  id: string;
  referredBy: string;
  /** Current stage id. */
  stage: string | null;
  /** Stage ids this deal has entered on the Active pipeline (history). */
  enteredStages: Set<string>;
  name?: string | null;
  value?: number | null;
  /** Raw current stage (any pipeline) for display. */
  displayStage?: string | null;
  /** Recorded entry into NDA / Needs List Sent (or closest later Active stage). */
  ndaEnteredAt?: string | null;
}

/** Only deals that ENTERED NDA / Needs List Sent within the trailing 12 months of `now`. */
export function inTrailingYear<T extends { ndaEnteredAt?: string | null }>(deals: T[], now = new Date()): T[] {
  const since = new Date(now);
  since.setFullYear(since.getFullYear() - 1);
  return deals.filter((d) => {
    if (!d.ndaEnteredAt) return false;
    const t = new Date(d.ndaEnteredAt).getTime();
    return t >= since.getTime() && t <= now.getTime();
  });
}

const sourceKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** NDA-cohort deals referred by `source`, flagged by whether they reached `target`. */
export function sourceCohortDeals(deals: ConversionDeal[], source: string, target: string) {
  const key = sourceKey(source);
  return deals
    .filter((d) => sourceKey(d.referredBy) === key && inNdaCohort(d))
    .map((d) => ({ deal: d, converted: reachedStage(d, target) }));
}

export interface SourceConversion {
  source: string;
  total: number;
  converted: number;
  rate: number;
}

const rank = (s: string | null) => (s ? NDA_ONWARD_STAGE_ORDER.indexOf(s) : -1);

/** True when the deal reached `target` (or any later Active stage), by history or current stage. */
export function reachedStage(d: ConversionDeal, target: string): boolean {
  const t = rank(target);
  if (t < 0) return false;
  if (rank(d.stage) >= t) return true;
  for (const s of d.enteredStages) if (rank(s) >= t) return true;
  return false;
}

/** True when the deal is in the NDA cohort (entered NDA / Needs List Sent or later). */
export function inNdaCohort(d: ConversionDeal): boolean {
  return reachedStage(d, "ndaneeds-list-sent");
}

/** Conversion rate per source from NDA / Needs List Sent to `target`. */
export function sourceConversions(deals: ConversionDeal[], target: string, minDeals = MIN_CONVERSION_DEALS): SourceConversion[] {
  const by = new Map<string, { source: string; total: number; converted: number }>();
  for (const d of deals) {
    const name = d.referredBy.trim();
    if (!name || !inNdaCohort(d)) continue;
    const key = name.toLowerCase().replace(/\s+/g, " ");
    const row = by.get(key) ?? { source: name, total: 0, converted: 0 };
    row.total += 1;
    if (reachedStage(d, target)) row.converted += 1;
    by.set(key, row);
  }
  return [...by.values()]
    .filter((r) => r.total >= minDeals)
    .map((r) => ({ ...r, rate: r.converted / r.total }));
}

export type ConversionMetric = "rate" | "count";

/** Top and bottom N by rate (or converted count); ties broken by more deals. Bottom excludes sources already in top. */
export function topAndBottom(rows: SourceConversion[], n = 3, metric: ConversionMetric = "rate") {
  const v = (r: SourceConversion) => (metric === "count" ? r.converted : r.rate);
  const top = [...rows].sort((a, b) => v(b) - v(a) || b.total - a.total).slice(0, n);
  const topKeys = new Set(top.map((r) => r.source));
  const bottom = [...rows]
    .filter((r) => !topKeys.has(r.source))
    .sort((a, b) => v(a) - v(b) || b.total - a.total)
    .slice(0, n);
  return { top, bottom };
}

/**
 * Closing Rate window (trailing 12 months): a deal counts when it entered NDA /
 * Needs List Sent OR entered Closed-Won within the last year. It counts as
 * converted only when its Closed-Won entry falls inside that window.
 */
export function closingRateDeals<T extends ConversionDeal & { closedWonAt?: string | null }>(deals: T[], now = new Date()): T[] {
  const since = new Date(now);
  since.setFullYear(since.getFullYear() - 1);
  const inWin = (at?: string | null) => {
    if (!at) return false;
    const t = new Date(at).getTime();
    return t >= since.getTime() && t <= now.getTime();
  };
  return deals
    .filter((d) => inWin(d.ndaEnteredAt) || inWin(d.closedWonAt))
    .map((d) => {
      if (inWin(d.closedWonAt)) return d;
      const enteredStages = new Set([...d.enteredStages].filter((s) => s !== "closed-won"));
      return { ...d, stage: d.stage === "closed-won" ? null : d.stage, enteredStages };
    });
}
