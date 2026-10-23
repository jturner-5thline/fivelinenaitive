import type { Deal } from '@/types/deal';
import { isExcludedDealName } from '@/utils/excludedDeals';

const CLOSED_STAGES = new Set(['closed-won', 'closed-lost']);

type PipelineStage = { id: string; label: string };
const normalizeStage = (stage: string) => stage.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
const ACTIVE_VOLUME_STAGES = new Set([
  'final credit items', 'client strategy review', 'write up pending',
  'submitted to lenders', 'lenders in review', 'terms issued',
  'in due diligence', 'agreement pending', 'funded invoiced',
]);

/** Caller supplies default-pipeline deals; stage order comes from that pipeline. */
export function totalActivePipelineValue(deals: Deal[], stages: PipelineStage[] = []): number {
  const milestoneIndex = stages.findIndex(s => normalizeStage(s.label) === 'final credit items');
  return deals.reduce((total, deal) => {
    if (isExcludedDealName(deal.company)) return total;
    const stageIndex = stages.findIndex(s => s.id === deal.stage || normalizeStage(s.label) === normalizeStage(deal.stage));
    const stageLabel = normalizeStage(stageIndex >= 0 ? stages[stageIndex].label : deal.stage);
    if (['closed won', 'closed lost'].includes(stageLabel) || CLOSED_STAGES.has(deal.stage)) return total;
    const qualifies = milestoneIndex >= 0 && stageIndex >= 0
      ? stageIndex >= milestoneIndex
      : ACTIVE_VOLUME_STAGES.has(stageLabel);
    const value = Number(deal.value);
    return qualifies && Number.isFinite(value) ? total + value : total;
  }, 0);
}

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
