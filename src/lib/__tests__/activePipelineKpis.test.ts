import { describe, it, expect } from 'vitest';
import { currentRevenuePerHour, totalActivePipelineValue } from '../activePipelineKpis';
import type { Deal } from '@/types/deal';

const d = (stage: string, totalFee: number, pre: number, post: number, company = 'Acme') =>
  ({ stage, totalFee, preSigningHours: pre, postSigningHours: post, company }) as any;

describe('currentRevenuePerHour', () => {
  it('aggregates total fee over total hours for open deals', () => {
    expect(currentRevenuePerHour([d('submitted-to-lenders', 10000, 5, 5), d('terms-issued', 20000, 10, 0)])).toBe(1500);
  });
  it('excludes Closed Won and Closed Lost deals', () => {
    expect(currentRevenuePerHour([d('terms-issued', 10000, 10, 0), d('closed-won', 90000, 1, 0), d('closed-lost', 5000, 50, 0)])).toBe(1000);
  });
  it('excludes test deals', () => {
    expect(currentRevenuePerHour([d('terms-issued', 10000, 10, 0), d('terms-issued', 99999, 1, 0, 'test deal')])).toBe(1000);
  });
  it('returns null with no hours logged', () => {
    expect(currentRevenuePerHour([d('terms-issued', 10000, 0, 0)])).toBeNull();
  });
});

describe('totalActivePipelineValue', () => {
  const deal = (stage: string, value: number, company = 'Acme') => ({ stage, value, company }) as Deal;
  it('sums deal volume from Final Credit Items onward, not fees or earlier sales stages', () => {
    expect(totalActivePipelineValue([
      deal('initial-feedback', 900000), deal('final-credit-items', 1000000),
      deal('submitted-to-lenders', 2000000), deal('funded-invoiced', 500000),
    ])).toBe(3500000);
  });
  it('excludes Closed Won and Closed Lost volume', () => {
    expect(totalActivePipelineValue([deal('terms-issued', 750000), deal('closed-won', 3000000), deal('closed-lost', 4000000)])).toBe(750000);
  });
  it('excludes globally excluded test deals', () => {
    expect(totalActivePipelineValue([deal('terms-issued', 100000), deal('terms-issued', 900000, 'Example Deal'), deal('terms-issued', 900000, 'test sample')])).toBe(100000);
  });
  it('uses assigned pipeline ordering and labels for custom IDs', () => {
    const stages = [
      { id: 'early', label: 'Initial Review' }, { id: 'credit', label: 'Final Credit Items' },
      { id: 'later', label: 'Custom Later Stage' }, { id: 'won', label: 'Closed Won' },
      { id: 'lost', label: 'Closed Lost' },
    ];
    expect(totalActivePipelineValue([deal('early', 900), deal('credit', 100), deal('later', 200), deal('won', 800), deal('lost', 700)], stages)).toBe(300);
  });
  it('returns zero for empty or invalid values and excludes unknown stages', () => {
    expect(totalActivePipelineValue([])).toBe(0);
    expect(totalActivePipelineValue([deal('terms-issued', NaN), deal('unknown', 500)])).toBe(0);
  });
});
