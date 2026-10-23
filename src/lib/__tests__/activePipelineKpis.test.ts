import { describe, it, expect } from 'vitest';
import { currentRevenuePerHour } from '../activePipelineKpis';

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
