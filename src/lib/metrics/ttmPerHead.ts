import { addMonths, format, parseISO } from 'date-fns';
import type { TtmInvoice, TtmPeriod } from './ttmRevenuePerDealHour';

export interface HeadcountRow { month: string; headcount: number | string | null }
export interface TtmHeadMonth { month: string; label: string; amount: number; headcount: number | null }

/** TTM amount ÷ average monthly headcount; needs all 12 months of headcount recorded, else rate is null. */
export function calculateTtmPerHead(period: TtmPeriod, amounts: TtmInvoice[], headcount: HeadcountRow[]) {
  const hc = new Map(headcount.map(r => [r.month.slice(0, 7), r.headcount == null ? null : Number(r.headcount)]));
  const months: TtmHeadMonth[] = [];
  for (let d = parseISO(period.start); format(d, 'yyyy-MM-dd') <= period.end; d = addMonths(d, 1)) {
    const key = format(d, 'yyyy-MM');
    const amount = amounts.reduce((s, a) => {
      const v = Number(a.total_amt);
      return a.txn_date.slice(0, 7) === key && Number.isFinite(v) ? s + v : s;
    }, 0);
    const h = hc.get(key);
    months.push({ month: key, label: format(d, 'MMM yyyy'), amount, headcount: h != null && Number.isFinite(h) ? h : null });
  }
  const revenue = months.reduce((s, m) => s + m.amount, 0);
  const complete = months.length === 12 && months.every(m => m.headcount != null);
  const avgHeadcount = complete ? months.reduce((s, m) => s + (m.headcount ?? 0), 0) / 12 : null;
  return { ...period, revenue, avgHeadcount, rate: avgHeadcount && avgHeadcount > 0 ? revenue / avgHeadcount : null, months };
}
