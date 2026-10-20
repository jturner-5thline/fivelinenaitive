/** A referral source is "at risk" when its most recent referred deal is 6+ months old. */
export const AT_RISK_MONTHS = 6;

/** Active-pipeline stages at or past "NDA / Needs List Sent" — a referral only counts once it gets here. */
export const REACHED_NDA_STAGES = new Set([
  'ndaneeds-list-sent','pre-credit-needs','initial-lender-review','initial-feedback','proposal-in-development',
  'proposal-issued','agreement-pending','final-credit-items','client-strategy-review','write-up-pending',
  'submitted-to-lenders','lenders-in-review','terms-issued','in-due-diligence','funded-invoiced','closed-won',
]);

export interface AtRiskInput {
  referredBy: string;
  deals: { id: string; company: string; created_at: string; value?: number | null; stage?: string | null }[];
}

export interface AtRiskRow {
  key: string;
  label: string;
  lastDealAt: string;
  monthsSince: number;
  totalDeals: number;
}

export function computeAtRiskSources(sources: AtRiskInput[], now: Date = new Date()): AtRiskRow[] {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - AT_RISK_MONTHS);
  const rows: AtRiskRow[] = [];
  for (const s of sources) {
    const qualifying = s.deals.filter((d) => d.stage == null || REACHED_NDA_STAGES.has(d.stage));
    if (!qualifying.length) continue;
    const last = qualifying.reduce((m, d) => (d.created_at > m ? d.created_at : m), qualifying[0].created_at);
    const lastDate = new Date(last);
    if (lastDate > cutoff) continue;
    const monthsSince =
      (now.getFullYear() - lastDate.getFullYear()) * 12 + (now.getMonth() - lastDate.getMonth());
    rows.push({ key: s.referredBy, label: s.referredBy, lastDealAt: last, monthsSince, totalDeals: qualifying.length });
  }
  return rows.sort((a, b) => a.lastDealAt.localeCompare(b.lastDealAt));
}
