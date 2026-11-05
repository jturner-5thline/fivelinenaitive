import { describe, it, expect } from 'vitest';
import { parseOnePagerLinks } from '../onePagerLinks';
describe('parseOnePagerLinks', () => {
  it('shows file names from stored "Name.pdf (url)" values', () => {
    expect(parseOnePagerLinks('A.pdf (https://x.com/1),B_ED.pdf (https://x.com/2)')).toEqual([
      { label: 'A.pdf', href: 'https://x.com/1' }, { label: 'B_ED.pdf', href: 'https://x.com/2' }]);
  });
  it('falls back to the last path segment for plain URLs', () => {
    expect(parseOnePagerLinks('https://x.com/docs/Deck.pdf')[0].label).toBe('Deck.pdf');
  });
});
