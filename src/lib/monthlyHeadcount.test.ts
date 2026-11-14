import { describe, expect, it } from 'vitest';
import { HEADCOUNT_COMPANY_ID, HEADCOUNT_UNITS, buildHeadcountChanges, headcountKey, headcountSummary, headcountMonthlyTotal, parseHeadcount } from './monthlyHeadcount';
describe('monthly headcount', () => {
  it('supports fractional FTE and distinguishes blank from zero', () => {
    expect(parseHeadcount('2.5')).toBe(2.5);
    expect(parseHeadcount('')).toBeNull();
    expect(parseHeadcount('0')).toBe(0);
  });
  it.each(['-1', '1.234', 'NaN', '10000', '3e2'])('rejects invalid input %s', value => expect(() => parseHeadcount(value)).toThrow());
  it('sums units and averages entered months including zero but not blanks', () => {
    expect(headcountSummary(['2.5', '0.5', '0', ''])).toEqual({ total: 3, average: 1 });
    expect(headcountSummary(['', ''])).toEqual({ total: 0, average: null });
  });
  it('saves only changed cells, anchored to month start, and supports clearing', () => {
    const key = headcountKey(HEADCOUNT_UNITS[0].realmId, 10);
    expect(buildHeadcountChanges(HEADCOUNT_COMPANY_ID, 2026, { [key]: '2.5' }, {})).toEqual([{ company_id: HEADCOUNT_COMPANY_ID, realm_id: '193514877331929', month: '2026-11-01', headcount: 2.5 }]);
    expect(buildHeadcountChanges(HEADCOUNT_COMPANY_ID, 2026, { [key]: '2.50' }, { [key]: '2.5' })).toEqual([]);
    expect(buildHeadcountChanges(HEADCOUNT_COMPANY_ID, 2026, { [key]: '' }, { [key]: '2.5' })[0].headcount).toBeNull();
  });
  it('rejects another workspace', () => expect(() => buildHeadcountChanges('other-company', 2026, {}, {})).toThrow());
});
describe('headcountMonthlyTotal', () => {
  it('subtracts 1 for the duplicate', () => expect(headcountMonthlyTotal(['4', '3', '', '4.5'])).toBe(10.5));
  it('is blank when no values', () => expect(headcountMonthlyTotal(['', ''])).toBeNull());
});
