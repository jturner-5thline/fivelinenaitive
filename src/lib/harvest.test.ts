import { describe, it, expect } from 'vitest';
import { aggregateHarvest, harvestRate, type HarvestEntry } from './harvest';
const entry = (overrides: Partial<HarvestEntry> = {}): HarvestEntry => ({ spent_date: '2024-01-15', hours: 2, billable: true, billable_rate: 100, currency: 'USD', user_name: 'Scott Williams', ...overrides });
describe('Harvest FinServ reporting', () => {
  it('imports only January 2024 onward', () => {
    expect(Object.keys(aggregateHarvest([entry({ spent_date: '2023-12-31' }), entry({ spent_date: '2024-01-01' })]))).toEqual(['2024-01']);
  });
  it('uses billable hours rather than total hours for revenue per hour', () => {
    const month = aggregateHarvest([entry(), entry({ billable: false, hours: 8 })])['2024-01'];
    expect(month.hours).toBe(10);
    expect(month.billableHours).toBe(2);
    expect(harvestRate(1000, month.billableHours)).toBe(500);
  });
  it('uses billable hours for operating profit per hour', () => expect(harvestRate(400, 2)).toBe(200));
  it('does not divide by missing or zero hours', () => expect(harvestRate(400, 0)).toBeNull());
  it('flags unknown rates instead of treating amounts as complete', () => {
    const m = aggregateHarvest([entry(), entry({ billable_rate: null }), entry({ currency: 'EUR' })])['2024-01'];
    expect(m.amount).toBe(200);
    expect(m.missingRates).toBe(2);
  });
  it('separates team billable and total hours for utilization', () => {
    const m = aggregateHarvest([entry(), entry({ billable: false }), entry({ user_name: 'Kris' })])['2024-01'];
    expect(m.people['Scott Williams']).toEqual({ hours: 4, billableHours: 2 });
    expect(m.people.Kris).toEqual({ hours: 2, billableHours: 2 });
  });
});