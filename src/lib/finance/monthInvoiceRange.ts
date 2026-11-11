/** Month window helpers for the Month to Date Revenue KPI. */
export interface MonthWindow { start: string; end: string; label: string; isCurrent: boolean }

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** offset 0 = current month (1st → today); negative = past full months. */
export function monthWindow(offset: number, today: Date = new Date()): MonthWindow {
  const o = Math.min(0, Math.trunc(offset));
  const first = new Date(today.getFullYear(), today.getMonth() + o, 1);
  const last = o === 0 ? today : new Date(first.getFullYear(), first.getMonth() + 1, 0);
  return {
    start: iso(first),
    end: iso(last),
    label: first.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    isCurrent: o === 0,
  };
}

export function sumInvoiceTotals(rows: Array<{ total_amt: number | null }>): number {
  return rows.reduce((s, r) => s + (Number(r.total_amt) || 0), 0);
}
