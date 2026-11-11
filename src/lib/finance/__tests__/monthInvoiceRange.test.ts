import { describe, it, expect } from 'vitest';
import { monthWindow, sumInvoiceTotals } from '../monthInvoiceRange';

const today = new Date(2026, 10, 11);
describe('monthWindow', () => {
  it('current month runs from the 1st to today', () => {
    expect(monthWindow(0, today)).toMatchObject({ start: '2026-11-01', end: '2026-11-11', isCurrent: true });
  });
  it('past month covers the full month', () => {
    expect(monthWindow(-2, today)).toMatchObject({ start: '2026-09-01', end: '2026-09-30', label: 'September 2026', isCurrent: false });
  });
  it('crosses year boundary and never goes into the future', () => {
    expect(monthWindow(-11, today).start).toBe('2025-12-01');
    expect(monthWindow(3, today).start).toBe('2026-11-01');
  });
});
describe('sumInvoiceTotals', () => {
  it('sums totals treating null as zero', () => {
    expect(sumInvoiceTotals([{ total_amt: 100.5 }, { total_amt: null }, { total_amt: 50 }])).toBe(150.5);
  });
});
