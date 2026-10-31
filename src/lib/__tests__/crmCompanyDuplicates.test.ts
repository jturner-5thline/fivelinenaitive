import { describe, it, expect } from 'vitest';
import { findCompanyDuplicates, normalizeDomain, normalizeCompanyName } from '../crmCompanyDuplicates';

describe('crmCompanyDuplicates', () => {
  it('normalizes domains and names', () => {
    expect(normalizeDomain('https://www.Acme.com/about')).toBe('acme.com');
    expect(normalizeDomain('gmail.com')).toBeNull();
    expect(normalizeCompanyName('Acme, Inc.')).toBe('acme');
    expect(normalizeCompanyName('Acme Holdings LLC')).toBe('acme');
  });

  const rows = [
    { id: 'a', name: 'Acme, Inc.', domain: 'acme.com' },
    { id: 'b', name: 'ACME', domain: null },
    { id: 'c', name: 'Totally Different', domain: 'https://www.acme.com' },
    { id: 'd', name: 'Unique Co', domain: 'unique.io' },
  ];

  it('groups by name or domain in any mode', () => {
    const g = findCompanyDuplicates(rows, 'any');
    expect(g).toHaveLength(1);
    expect(g[0].memberIds.sort()).toEqual(['a', 'b', 'c']);
    expect(g[0].reasons).toEqual(['domain', 'name']);
  });

  it('name-only mode ignores domains', () => {
    const g = findCompanyDuplicates(rows, 'name');
    expect(g[0].memberIds.sort()).toEqual(['a', 'b']);
  });

  it('domain-only mode ignores names', () => {
    const g = findCompanyDuplicates(rows, 'domain');
    expect(g[0].memberIds.sort()).toEqual(['a', 'c']);
  });
});
