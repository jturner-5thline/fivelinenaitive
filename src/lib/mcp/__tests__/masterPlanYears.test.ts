import { describe, it, expect } from 'vitest';
import { planPeriod, headcountMonth } from '../masterPlan';
describe('Master Plan MCP periods', () => {
  it('accepts 2026, 2027 and 2028 months and quarters', () => {
    for (const p of ['2026-01', '2026-Q4', '2027-12', '2028-Q1']) expect(planPeriod.safeParse(p).success).toBe(true);
  });
  it('rejects years not shown in the Master Plan', () => {
    expect(planPeriod.safeParse('2025-12').success).toBe(false);
    expect(planPeriod.safeParse('2029-01').success).toBe(false);
  });
  it('headcount accepts 2026 months but not quarters', () => {
    expect(headcountMonth.safeParse('2026-03').success).toBe(true);
    expect(headcountMonth.safeParse('2026-Q1').success).toBe(false);
  });
});
