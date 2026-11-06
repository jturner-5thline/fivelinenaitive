import { describe, it, expect } from 'vitest';
import { computeCashflowKpis } from '../cashflowKpis';

const wk = (we: string, rec: number, dis: number, end: number) => ({
  week_ending: we, 'TOTAL RECEIPTS': rec, 'TOTAL DISBURSEMENTS': dis, 'ENDING CASH': end,
});
const weekly: any = {
  '2026-10-24': wk('2026-10-30', 100, 50, 900),
  '2026-10-31': wk('2026-11-06', 200, 80, 1000),
  '2026-11-07': wk('2026-11-13', 300, 500, 800),
  '2026-11-14': wk('2026-11-20', 400, 100, 1100),
  '2026-11-21': wk('2026-11-27', 999, 0, 5000),
};

describe('computeCashflowKpis', () => {
  it('sums receipts/disbursements from the current week through weeksFuture', () => {
    const k = computeCashflowKpis(weekly, 2, 1, '2026-11-06');
    expect(k.cashIn).toBe(900);
    expect(k.cashOut).toBe(680);
    expect(k.netChange).toBe(220);
    expect(k.kpiWeekCount).toBe(3);
  });

  it('finds peak and low ending cash across weeksPast through weeksFuture', () => {
    const k = computeCashflowKpis(weekly, 2, 1, '2026-11-06');
    expect(k.peakCash).toMatchObject({ value: 1100, weekEnding: '2026-11-20' });
    expect(k.lowCash).toMatchObject({ value: 800, weekEnding: '2026-11-13' });
  });

  it('ignores past weeks for cash in/out when weeksPast is set', () => {
    const k = computeCashflowKpis(weekly, 0, 3, '2026-11-06');
    expect(k.cashIn).toBe(200);
    expect(k.lowCash?.value).toBe(900);
  });
});
