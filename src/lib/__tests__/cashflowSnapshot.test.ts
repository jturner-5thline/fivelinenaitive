import { describe, it, expect } from 'vitest';
import { buildCashflowSnapshot } from '../cashflowSnapshot';

const weekly = {
  '2026-10-11': { week_ending: '2026-10-11', 'ENDING CASH': 300000, Payroll: 50000 },
  '2026-10-18': { week_ending: '2026-10-18', 'ENDING CASH': 280000, Payroll: 50000 },
  '2026-10-25': { week_ending: '2026-10-25', 'ENDING CASH': 260000, Payroll: 0 },
  '2026-11-01': { week_ending: '2026-11-01', 'ENDING CASH': 240000, Payroll: 50000 },
};

describe('buildCashflowSnapshot', () => {
  it('slices weeksPast..weeksFuture around the current week', () => {
    const s = buildCashflowSnapshot(weekly, ['ENDING CASH'], new Set(), 1, 1, '2026-10-22')!;
    expect(s.weeks).toEqual(['2026-10-18', '2026-10-25', '2026-11-01']);
    expect(s.currentWeek).toBe('2026-10-25');
    expect(s.rows[0].values).toEqual([280000, 260000, 240000]);
  });
  it('shows disbursements as negative, like the table', () => {
    const s = buildCashflowSnapshot(weekly, ['Payroll'], new Set(['Payroll']), 0, 0, '2026-10-12')!;
    expect(s.rows[0].values).toEqual([-50000]);
  });
});
