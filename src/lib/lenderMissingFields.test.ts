import { describe, it, expect } from 'vitest';
import { filterLendersByMissingFields, isFieldValueMissing } from './lenderMissingFields';

const lenders = [
  { id: 'a', website: '', email: 'x@y.com', industries: [] },
  { id: 'b', website: null, email: null, industries: ['SaaS'] },
  { id: 'c', website: 'c.com', email: 'c@c.com', industries: ['SaaS'] },
];

describe('lender missing fields filter', () => {
  it('treats null, blank, and empty arrays as missing', () => {
    expect(isFieldValueMissing(null)).toBe(true);
    expect(isFieldValueMissing('  ')).toBe(true);
    expect(isFieldValueMissing([])).toBe(true);
    expect(isFieldValueMissing(0)).toBe(false);
  });
  it('any mode returns lenders missing at least one field', () => {
    expect(filterLendersByMissingFields(lenders, ['website', 'email'], 'any').map((l) => l.id)).toEqual(['a', 'b']);
  });
  it('all mode returns lenders missing every field', () => {
    expect(filterLendersByMissingFields(lenders, ['website', 'email'], 'all').map((l) => l.id)).toEqual(['b']);
  });
  it('no fields selected returns everything', () => {
    expect(filterLendersByMissingFields(lenders, [], 'all')).toHaveLength(3);
  });
});
