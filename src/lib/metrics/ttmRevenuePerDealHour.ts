import { endOfMonth, format, startOfMonth, subMonths } from 'date-fns';
import { QBO_REALM_DEBT } from '@/config/qboEntities';
import { isExcludedDealName } from '@/utils/excludedDeals';

export const TTM_REVENUE_REALM_ID = QBO_REALM_DEBT;
export const TTM_HOUR_PIPELINE_IDS = [
  'b78ad452-b489-4c89-8a91-789347c05f79',
  '40b17dfb-9122-49e0-bf7c-5aa993d5d615',
];

export interface TtmPeriod { label: string; start: string; end: string }
export interface TtmInvoice { txn_date: string; total_amt: number | string | null }
export interface TtmHours {
  deal_id: string;
  week_start_date: string;
  hours: number | string | null;
  deals: { company: string; company_id: string | null; pipeline_id: string | null };
}
export interface TtmDealContribution { id: string; name: string; pipeline: string; hours: number }

/** Includes one hidden prior period so the first visible bar also has a delta. */
export function buildTtmPeriods(anchorEnd: string, view: 'month' | 'quarter'): TtmPeriod[] {
  const anchor = new Date(`${anchorEnd}T12:00:00`);
  const step = view === 'quarter' ? 3 : 1;
  const count = view === 'quarter' ? 4 : 12;
  return Array.from({ length: count + 1 }, (_, i) => {
    const end = endOfMonth(subMonths(anchor, (count - i) * step));
    const start = startOfMonth(subMonths(end, 11));
    return {
      label: view === 'quarter' ? `Q${Math.floor(end.getMonth() / 3) + 1} ${format(end, 'yy')}` : format(end, 'MMM yy'),
      start: format(start, 'yyyy-MM-dd'),
      end: format(end, 'yyyy-MM-dd'),
    };
  });
}

export function calculateTtmPeriod(period: TtmPeriod, invoices: TtmInvoice[], entries: TtmHours[], companyId: string) {
  const inWindow = (date: string) => date >= period.start && date <= period.end;
  const revenue = invoices.reduce((sum, invoice) => {
    const amount = Number(invoice.total_amt);
    return inWindow(invoice.txn_date) && Number.isFinite(amount) ? sum + amount : sum;
  }, 0);
  const byDeal = new Map<string, TtmDealContribution>();
  for (const entry of entries) {
    const deal = entry.deals;
    const pipelineIndex = TTM_HOUR_PIPELINE_IDS.indexOf(deal.pipeline_id ?? '');
    const hours = Number(entry.hours);
    if (!inWindow(entry.week_start_date) || deal.company_id !== companyId || pipelineIndex < 0 ||
      isExcludedDealName(deal.company) || deal.company.trim().toLowerCase() === "test-niki's store" ||
      !Number.isFinite(hours)) continue;
    const contribution = byDeal.get(entry.deal_id) ?? {
      id: entry.deal_id, name: deal.company,
      pipeline: pipelineIndex === 0 ? 'Active Pipeline' : 'In Development', hours: 0,
    };
    contribution.hours += hours;
    byDeal.set(entry.deal_id, contribution);
  }
  const deals = [...byDeal.values()].filter(deal => deal.hours !== 0).sort((a, b) => b.hours - a.hours);
  const hours = deals.reduce((sum, deal) => sum + deal.hours, 0);
  return { ...period, revenue, hours, rate: hours > 0 ? revenue / hours : null, deals };
}

/** Ordered callers supply each page; never return a truncated successful total. */
export async function loadAllTtmRows<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, pageSize = 500): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}