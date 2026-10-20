/** A referral source shows as "at risk" once 4 months pass without a referred deal. */
export const AT_RISK_MONTHS = 4;
/** After 6 months without a referred deal, a source is removed from the pipeline. */
export const REMOVAL_MONTHS = 6;

/** Active-pipeline stages at or past "NDA / Needs List Sent" — a referral only counts once it gets here. */
export const REACHED_NDA_STAGES = new Set([
  'ndaneeds-list-sent','pre-credit-needs','initial-lender-review','initial-feedback','proposal-in-development',
  'proposal-issued','agreement-pending','final-credit-items','client-strategy-review','write-up-pending',
  'submitted-to-lenders','lenders-in-review','terms-issued','in-due-diligence','funded-invoiced','closed-won',
]);

export interface AtRiskInput {
  referredBy: string;
  /** When the source was added to the pipeline (manual or automatic). Protects new sources. */
  addedAt?: string | null;
  deals: { id: string; company: string; created_at: string; value?: number | null; stage?: string | null }[];
}

export interface AtRiskRow {
  key: string;
  label: string;
  lastDealAt: string;
  monthsSince: number;
  totalDeals: number;
}

const monthsAgo = (now: Date, months: number) => {
  const d = new Date(now);
  d.setMonth(d.getMonth() - months);
  return d;
};

/**
 * The date the 6-month clock runs from: the later of the last qualifying
 * deal and the date the source was added. Null when neither is known.
 */
export function activityAnchor(s: AtRiskInput): { at: string; qualifying: number } | null {
  const qualifying = s.deals.filter((d) => d.stage == null || REACHED_NDA_STAGES.has(d.stage));
  let at: string | null = s.addedAt ?? null;
  for (const d of qualifying) if (!at || d.created_at > at) at = d.created_at;
  return at ? { at, qualifying: qualifying.length } : null;
}

/** True when a source has gone 6+ months without a referred deal (and was added 6+ months ago). */
export function isRemovedForInactivity(s: AtRiskInput, now: Date = new Date()): boolean {
  const a = activityAnchor(s);
  return !!a && new Date(a.at) <= monthsAgo(now, REMOVAL_MONTHS);
}

/** Sources in the 4–6 month warning window. Removed (6+ month) sources are excluded. */
export function computeAtRiskSources(sources: AtRiskInput[], now: Date = new Date()): AtRiskRow[] {
  const warn = monthsAgo(now, AT_RISK_MONTHS);
  const remove = monthsAgo(now, REMOVAL_MONTHS);
  const rows: AtRiskRow[] = [];
  for (const s of sources) {
    const a = activityAnchor(s);
    if (!a) continue;
    const lastDate = new Date(a.at);
    if (lastDate > warn || lastDate <= remove) continue;
    const monthsSince =
      (now.getFullYear() - lastDate.getFullYear()) * 12 + (now.getMonth() - lastDate.getMonth());
    rows.push({ key: s.referredBy, label: s.referredBy, lastDealAt: a.at, monthsSince, totalDeals: a.qualifying });
  }
  return rows.sort((a, b) => a.lastDealAt.localeCompare(b.lastDealAt));
}
