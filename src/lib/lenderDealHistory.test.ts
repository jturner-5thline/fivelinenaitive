import { describe, it, expect } from 'vitest';
import { formatOutsideDealAmount, outsideDealSourceUrl, isDuplicateError } from './lenderDealHistory';

describe('outside deal helpers', () => {
  it('prefers numeric amount, falls back to range text', () => {
    expect(formatOutsideDealAmount(null, '$10-15MM')).toBe('$10-15MM');
    expect(formatOutsideDealAmount(null, null)).toBe('—');
    expect(formatOutsideDealAmount(5000000, '$10-15MM')).not.toBe('$10-15MM');
  });
  it('links URLs and Gmail ids only', () => {
    expect(outsideDealSourceUrl('https://x.com/a')).toBe('https://x.com/a');
    expect(outsideDealSourceUrl('19dd8b0f17e1aab6')).toContain('19dd8b0f17e1aab6');
    expect(outsideDealSourceUrl('press release')).toBeNull();
  });
  it('recognises unique violations', () => {
    expect(isDuplicateError({ code: '23505' })).toBe(true);
    expect(isDuplicateError({ code: '42501' })).toBe(false);
  });
});
