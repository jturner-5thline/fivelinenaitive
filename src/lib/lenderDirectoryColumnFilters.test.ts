import { describe, it, expect } from 'vitest';
import { applyDirectoryColumnFilters, EMPTY_DIRECTORY_FILTERS, distinctColumnValues } from './lenderDirectoryColumnFilters';

const lenders = [
  { name: 'Alpha', min_deal: 1_000_000, max_deal: 10_000_000, loan_types: ['ABL', 'Term Loan'], geo: 'US, Canada', industries: ['Healthcare'] },
  { name: 'Beta', min_deal: 20_000_000, max_deal: null, loan_types: ['Mezz'], geo: ['US'], industries: ['SaaS'] },
  { name: 'Gamma', min_deal: null, max_deal: null, loan_types: [], geo: null, industries: [] },
];
const none = () => false;

describe('directory column filters', () => {
  it('check size keeps lenders whose min-max range covers the amount', () => {
    const r = applyDirectoryColumnFilters(lenders, { ...EMPTY_DIRECTORY_FILTERS, checkSize: 5_000_000 }, none);
    expect(r.map(l => l.name)).toEqual(['Alpha']);
  });
  it('open-ended max covers large amounts', () => {
    const r = applyDirectoryColumnFilters(lenders, { ...EMPTY_DIRECTORY_FILTERS, checkSize: 50_000_000 }, none);
    expect(r.map(l => l.name)).toEqual(['Beta']);
  });
  it('geo matches comma strings and arrays, case-insensitive', () => {
    const r = applyDirectoryColumnFilters(lenders, { ...EMPTY_DIRECTORY_FILTERS, geo: ['canada'] }, none);
    expect(r.map(l => l.name)).toEqual(['Alpha']);
  });
  it('combines structure and industries filters', () => {
    const r = applyDirectoryColumnFilters(lenders, { ...EMPTY_DIRECTORY_FILTERS, structure: ['Mezz', 'ABL'], industries: ['SaaS'] }, none);
    expect(r.map(l => l.name)).toEqual(['Beta']);
  });
  it('status filter uses on-deal state', () => {
    const r = applyDirectoryColumnFilters(lenders, { ...EMPTY_DIRECTORY_FILTERS, status: 'on' }, l => l.name === 'Gamma');
    expect(r.map(l => l.name)).toEqual(['Gamma']);
  });
  it('lists distinct values', () => {
    expect(distinctColumnValues(lenders, 'geo')).toEqual(['Canada', 'US']);
  });
});

import { parseCheckSizeInput, fitsCheckSize } from './lenderDirectoryColumnFilters';
describe('check size regression', () => {
  it('parses full dollar input', () => {
    expect(parseCheckSizeInput('10000000')).toBe(10_000_000);
    expect(parseCheckSizeInput('$10,000,000')).toBe(10_000_000);
    expect(parseCheckSizeInput('10M')).toBe(10_000_000);
  });
  it('excludes a lender with a $30M minimum for a $10M deal', () => {
    expect(fitsCheckSize({ name: 'X', min_deal: 30_000_000, max_deal: null }, 10_000_000)).toBe(false);
    expect(fitsCheckSize({ name: 'X', min_deal: 30_000_000, max_deal: 100_000_000 }, 10_000_000)).toBe(false);
  });
  it('uses the only bound present', () => {
    expect(fitsCheckSize({ name: 'X', min_deal: null, max_deal: 20_000_000 }, 10_000_000)).toBe(true);
    expect(fitsCheckSize({ name: 'X', min_deal: null, max_deal: 5_000_000 }, 10_000_000)).toBe(false);
    expect(fitsCheckSize({ name: 'X', min_deal: 5_000_000, max_deal: null }, 10_000_000)).toBe(true);
  });
});
