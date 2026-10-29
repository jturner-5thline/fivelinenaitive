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
