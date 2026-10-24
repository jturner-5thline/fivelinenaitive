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

type ActivePosition = 'start' | 'middle' | 'diligence';

/** Returns the deal's position within the Active Deals cohort, or null if outside it. */
function activeDealPosition(deal: Deal, stages: PipelineStage[]): ActivePosition | null {
  if (isExcludedDealName(deal.company) || deal.company?.trim().toLowerCase() === "test-niki's store") return null;
  const index = stages.findIndex(s => s.id === deal.stage || normalizeStage(s.label) === normalizeStage(deal.stage));
  const label = normalizeStage(index >= 0 ? stages[index].label : deal.stage);
  if (['closed won', 'closed lost'].includes(label) || CLOSED_STAGES.has(deal.stage)) return null;
  if (stages.length > 0) {
    const start = stages.findIndex(s => normalizeStage(s.label) === 'final credit items');
    const end = stages.findIndex(s => normalizeStage(s.label) === 'in due diligence');
    if (!(start >= 0 && end >= start && index >= start && index <= end)) return null;
    return index === start ? 'start' : index === end ? 'diligence' : 'middle';
  }
  const fallbackStages = new Set([
    'final credit items', 'client strategy review', 'write up pending',
    'submitted to lenders', 'lenders in review', 'terms issued', 'in due diligence',
  ]);
  if (!fallbackStages.has(label)) return null;
  return label === 'final credit items' ? 'start' : label === 'in due diligence' ? 'diligence' : 'middle';
}

/** Caller supplies default-pipeline deals; both stage boundaries are inclusive. */
export function activeDealsCount(deals: Deal[], stages: PipelineStage[] = []): number {
  return deals.reduce((count, deal) => (activeDealPosition(deal, stages) ? count + 1 : count), 0);
}

const money = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

/**
 * Total Revenue over the Active Deals cohort:
 * - Final Credit Items: Total Fee
 * - After Final Credit Items (before In Due Diligence): Total Fee − Retainer
 * - In Due Diligence: Total Fee − Milestone − Retainer (closing fee)
 * Each deal's contribution is floored at 0.
 */
export function totalActiveRevenue(deals: Deal[], stages: PipelineStage[] = []): number {
  return deals.reduce((total, deal) => {
    const pos = activeDealPosition(deal, stages);
    if (!pos) return total;
    const fee = money(deal.totalFee);
    const retainer = money(deal.retainerFee);
    const milestone = money(deal.milestoneFee);
    const value = pos === 'start' ? fee : pos === 'middle' ? fee - retainer : fee - retainer - milestone;
    return total + Math.max(0, value);
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

export type KpiKey = 'rev_hour' | 'active_pipeline' | 'sales_pipeline' | 'total_revenue' | 'active_deals';
export interface KpiDrilldownRow { deal: Deal; stageLabel: string; amount: number | null; detail?: string }

/** Deals that factor into each KPI, using the exact same rules as the totals. */
export function kpiDrilldownRows(key: KpiKey, deals: Deal[], stages: PipelineStage[] = []): KpiDrilldownRow[] {
  const label = (d: Deal) => stages.find(s => s.id === d.stage || normalizeStage(s.label) === normalizeStage(d.stage))?.label ?? d.stage;
  const rows: KpiDrilldownRow[] = [];
  for (const d of deals) {
    if (key === 'active_deals') {
      if (activeDealPosition(d, stages)) rows.push({ deal: d, stageLabel: label(d), amount: Number(d.value) || 0 });
    } else if (key === 'total_revenue') {
      if (!activeDealPosition(d, stages)) continue;
      const amount = totalActiveRevenue([d], stages);
      const pos = activeDealPosition(d, stages);
      rows.push({ deal: d, stageLabel: label(d), amount, detail: pos === 'start' ? 'Total fee' : pos === 'middle' ? 'Fee − retainer' : 'Closing fee' });
    } else if (key === 'active_pipeline' || key === 'sales_pipeline') {
      const fn = key === 'active_pipeline' ? totalActivePipelineValue : totalSalesPipelineValue;
      if (fn([{ ...d, value: 1 } as Deal], stages) > 0) rows.push({ deal: d, stageLabel: label(d), amount: Number(d.value) || 0 });
    } else {
      if (CLOSED_STAGES.has(d.stage) || isExcludedDealName(d.company)) continue;
      const fee = Number(d.totalFee) || 0;
      const hrs = (Number(d.preSigningHours) || 0) + (Number(d.postSigningHours) || 0);
      if (fee <= 0 && hrs <= 0) continue;
      rows.push({ deal: d, stageLabel: label(d), amount: fee, detail: `${hrs.toLocaleString()} hrs${hrs > 0 ? ` · $${Math.round(fee / hrs).toLocaleString()}/hr` : ''}` });
    }
  }
  return rows.sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
}
