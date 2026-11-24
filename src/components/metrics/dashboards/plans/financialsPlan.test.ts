import { describe, it, expect } from 'vitest';
import { formatFinancial, parseFinancialInput, financialPeriods, financialMetricKey } from './financialsPlan';

describe('financials plan', () => {
  it('formats currency like $#,##0', () => {
    expect(formatFinancial(163038, 'currency')).toBe('$163,038');
    expect(formatFinancial(-603.67, 'currency')).toBe('-$604');
  });
  it('formats percent like 0%', () => {
    expect(formatFinancial(82.1, 'percent')).toBe('82%');
  });
  it('parses typed values and blanks', () => {
    expect(parseFinancialInput('$1,250')).toBe(1250);
    expect(parseFinancialInput('-19%')).toBe(-19);
    expect(parseFinancialInput('')).toBeNull();
    expect(() => parseFinancialInput('abc')).toThrow();
  });
  it('builds monthly and quarterly periods', () => {
    expect(financialPeriods(2028, 'quarterly').map((p) => p.key)).toEqual(['2028-Q1', '2028-Q2', '2028-Q3', '2028-Q4']);
    expect(financialPeriods(2027, 'monthly')[11].key).toBe('2027-12');
    expect(financialPeriods(2027, 'monthly')[0].label).toBe('Jan-27');
    expect(financialMetricKey('finserv', 'revenue')).toBe('plan:financials:finserv:revenue');
  });
});

import { financialRowsFor } from './financialsPlan';
describe('financial rows per segment', () => {
  it('includes Tech and TTM per-head rows', () => {
    expect(financialRowsFor('tech').map((r) => r.label)).toContain('TTM Operating Cashflow/Head');
    expect(financialRowsFor('consolidated')[7].label).toBe('TTM Avg Headcount');
    expect(financialRowsFor('debt').some((r) => r.key === 'ttm-avg-headcount')).toBe(false);
  });
});

import { computeTtmSum, trailingPeriods } from './financialsPlan';
describe('calculated TTM sums', () => {
  it('Jan 2027 sums Feb 2026 through Jan 2027', () => {
    const t = trailingPeriods('2027-01');
    expect(t[0]).toBe('2026-02'); expect(t[11]).toBe('2027-01'); expect(t).toHaveLength(12);
    expect(computeTtmSum(() => 100, '2027-01')).toBe(1200);
  });
  it('2027-Q1 sums 2026-Q2 through 2027-Q1', () => {
    expect(trailingPeriods('2027-Q1')).toEqual(['2026-Q2', '2026-Q3', '2026-Q4', '2027-Q1']);
  });
  it('shows nothing for 2026 periods', () => {
    expect(computeTtmSum(() => 100, '2026-12')).toBeNull();
  });
});
