import { describe, it, expect } from 'vitest';
import { calculateTtmPerHead, firmWideHeadcount } from './ttmPerHead';

const period = { label: 'Dec 26', start: '2026-01-01', end: '2026-12-31' };
const months = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}-01`);

describe('calculateTtmPerHead', () => {
  it('divides TTM amount by the 12-month average headcount', () => {
    const r = calculateTtmPerHead(period,
      [{ txn_date: '2026-03-15', total_amt: 600000 }, { txn_date: '2026-11-02', total_amt: '600000' }, { txn_date: '2025-12-31', total_amt: 999 }],
      months.map((m, i) => ({ month: m, headcount: i < 6 ? 10 : 14 })));
    expect(r.revenue).toBe(1200000);
    expect(r.avgHeadcount).toBe(12);
    expect(r.rate).toBe(100000);
  });
  it('returns no rate when any month lacks headcount', () => {
    const r = calculateTtmPerHead(period, [{ txn_date: '2026-03-15', total_amt: 100 }], months.slice(1).map(m => ({ month: m, headcount: 5 })));
    expect(r.rate).toBeNull();
  });
});

describe('firmWideHeadcount', () => {
  it('sums units per month and subtracts 1 for the duplicate', () => {
    const out = firmWideHeadcount([
      { month: '2026-01-01', headcount: 4 }, { month: '2026-01-01', headcount: '3' }, { month: '2026-01-01', headcount: 4.5 },
      { month: '2026-02-01', headcount: null },
    ]);
    expect(out).toEqual([{ month: '2026-01-01', headcount: 10.5 }]);
  });
});
