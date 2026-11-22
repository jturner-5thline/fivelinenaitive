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
