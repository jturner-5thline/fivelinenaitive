import { describe, it, expect } from 'vitest';
import { pickMonthlySnapshots } from '@/lib/qboMonthly';
import { latestPerMonth } from '@/hooks/useTtmRevenuePerDealHour';

describe('Debt Advisory revenue uses latest full-month QBO P&L', () => {
  it('ignores month-to-date partial snapshots', () => {
    const rows = [
      { realm_id: 'r', period_start: '2026-04-01', period_end: '2026-04-30', fetched_at: '2026-11-16', income_total: 67222.41 },
      { realm_id: 'r', period_start: '2026-04-01', period_end: '2026-04-20', fetched_at: '2026-11-17', income_total: 1 },
    ];
    expect(pickMonthlySnapshots(rows)['r::2026-04'].income_total).toBe(67222.41);
  });
  it('keeps only the most recently fetched April snapshot (stale $82,777.59 dropped)', () => {
    const rows = [
      { period_start: '2026-04-01', period_end: '2026-04-30', fetched_at: '2026-07-27', income_total: 82777.59, gross_profit: 0 },
      { period_start: '2026-04-01', period_end: '2026-04-30', fetched_at: '2026-11-16', income_total: 67222.41, gross_profit: 0 },
    ];
    const out = latestPerMonth(rows, new Set(['2026-04-01_2026-04-30']));
    expect(out).toHaveLength(1);
    expect(out[0].income_total).toBe(67222.41);
  });
});
