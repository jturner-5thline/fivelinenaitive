/** A referral source is "at risk" when its most recent referred deal is 6+ months old. */
export const AT_RISK_MONTHS = 6;

export interface AtRiskInput {
  referredBy: string;
  deals: { id: string; company: string; created_at: string; value?: number | null }[];
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
    if (!s.deals.length) continue;
    const last = s.deals.reduce((m, d) => (d.created_at > m ? d.created_at : m), s.deals[0].created_at);
    const lastDate = new Date(last);
    if (lastDate > cutoff) continue;
    const monthsSince =
      (now.getFullYear() - lastDate.getFullYear()) * 12 + (now.getMonth() - lastDate.getMonth());
    rows.push({ key: s.referredBy, label: s.referredBy, lastDealAt: last, monthsSince, totalDeals: s.deals.length });
  }
  return rows.sort((a, b) => a.lastDealAt.localeCompare(b.lastDealAt));
}
