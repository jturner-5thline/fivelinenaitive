import { describe, it, expect } from 'vitest';
import { generateOccurrences, type ScheduledCashFlow } from '../scheduledCashFlows';

const d = (s: string) => new Date(s + 'T00:00:00');

describe('generateOccurrences date overrides', () => {
  it('includes a monthly occurrence moved earlier into the week (no end_date)', () => {
    const alloy = {
      account: '5LFS 0661', category: 'FinServ Revenue', amount: 3000, flow_type: 'cash_in',
      frequency_type: 'monthly_day', start_date: '2026-05-15', end_date: null,
      frequency_config: { day_of_month: 15, date_overrides: { '2026-11-15': '2026-11-06' } },
    } as unknown as ScheduledCashFlow;
    expect(generateOccurrences(alloy, d('2026-10-31'), d('2026-11-06'))).toEqual(['2026-11-06']);
    expect(generateOccurrences(alloy, d('2026-11-14'), d('2026-11-20'))).toEqual([]);
  });
});
