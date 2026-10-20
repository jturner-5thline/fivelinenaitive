import { describe, it, expect } from 'vitest';
import { scoreMatch, rankTop, sanitizeIlike } from './omniSearch';

describe('omniSearch', () => {
  it('ranks prefix above word-start above contains', () => {
    expect(scoreMatch('Acme Corp', 'acm')).toBe(3);
    expect(scoreMatch('Big Acme', 'acm')).toBe(2);
    expect(scoreMatch('Placme', 'acm')).toBe(1);
    expect(scoreMatch('Other', 'acm')).toBe(0);
  });

  it('returns top matches best-first and capped', () => {
    const items = ['Zeta Acme', 'Acme', 'Nothing', 'Acme Two'];
    expect(rankTop(items, (i) => [i], 'acme', 2)).toEqual(['Acme', 'Acme Two']);
  });

  it('returns nothing for an empty query', () => {
    expect(rankTop(['a'], (i) => [i], '  ', 5)).toEqual([]);
  });

  it('strips characters that break backend filters', () => {
    expect(sanitizeIlike('a,b(c)%')).toBe('a b c');
  });
});
