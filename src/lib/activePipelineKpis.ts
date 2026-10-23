import type { Deal } from '@/types/deal';
import { isExcludedDealName } from '@/utils/excludedDeals';

const CLOSED_STAGES = new Set(['closed-won', 'closed-lost']);

/**
 * Aggregate revenue / hour for open Active Pipeline deals:
 * sum(totalFee) ÷ sum(pre + post signing hours), excluding Closed Won / Closed Lost
 * and globally excluded test deals. Returns null when no hours are logged.
 */
export function currentRevenuePerHour(deals: Deal[]): number | null {
  let fees = 0;
  let hours = 0;
  for (const d of deals) {
    if (CLOSED_STAGES.has(d.stage)) continue;
    if (isExcludedDealName(d.company)) continue;
    fees += Number(d.totalFee) || 0;
    hours += (Number(d.preSigningHours) || 0) + (Number(d.postSigningHours) || 0);
  }
  return hours > 0 ? fees / hours : null;
}
