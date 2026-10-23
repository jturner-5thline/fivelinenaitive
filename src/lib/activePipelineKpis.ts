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
const SALES_VOLUME_STAGES = new Set([
  'nda & needs list sent', 'nda and needs list sent', 'nda needs list sent',
  'pre credit needs', 'proposal in development', 'proposal issued', 'agreement pending',
]);

/** Caller supplies default-pipeline deals; both stage boundaries are inclusive. */
export function activeDealsCount(deals: Deal[], stages: PipelineStage[] = []): number {
  const start = stages.findIndex(s => normalizeStage(s.label) === 'final credit items');
  const end = stages.findIndex(s => normalizeStage(s.label) === 'in due diligence');
  const fallbackStages = new Set([
    'final credit items', 'client strategy review', 'write up pending',
    'submitted to lenders', 'lenders in review', 'terms issued', 'in due diligence',
  ]);
  return deals.reduce((count, deal) => {
    if (isExcludedDealName(deal.company) || deal.company?.trim().toLowerCase() === "test-niki's store") return count;
    const index = stages.findIndex(s => s.id === deal.stage || normalizeStage(s.label) === normalizeStage(deal.stage));
    const label = normalizeStage(index >= 0 ? stages[index].label : deal.stage);
    if (['closed won', 'closed lost'].includes(label) || CLOSED_STAGES.has(deal.stage)) return count;
    const qualifies = stages.length > 0
      ? start >= 0 && end >= start && index >= start && index <= end
      : fallbackStages.has(label);
    return qualifies ? count + 1 : count;
  }, 0);
}

/** Caller supplies default-pipeline deals; include the sales cutoff itself. */
export function totalSalesPipelineValue(deals: Deal[], stages: PipelineStage[] = []): number {
  const cutoffIndex = stages.findIndex(s => normalizeStage(s.label) === 'agreement pending');
  return deals.reduce((total, deal) => {
    if (isExcludedDealName(deal.company)) return total;
    const stageIndex = stages.findIndex(s => s.id === deal.stage || normalizeStage(s.label) === normalizeStage(deal.stage));
    const stageLabel = normalizeStage(stageIndex >= 0 ? stages[stageIndex].label : deal.stage);
    if (['closed won', 'closed lost'].includes(stageLabel) || CLOSED_STAGES.has(deal.stage)) return total;
    const qualifies = stages.length > 0
      ? cutoffIndex >= 0 && stageIndex >= 0 && stageIndex <= cutoffIndex
      : SALES_VOLUME_STAGES.has(stageLabel);
    const value = Number(deal.value);
    return qualifies && Number.isFinite(value) ? total + value : total;
  }, 0);
}

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
