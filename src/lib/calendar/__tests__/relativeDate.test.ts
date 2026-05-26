import { describe, it, expect } from 'vitest';
import { getRelativeDateLabel } from '../relativeDate';

const TZ = 'America/New_York';

describe('getRelativeDateLabel', () => {
  // Anchor "now": Tue May 26 2026 12:00 EDT  => 16:00 UTC
  const now = new Date('2026-05-26T16:00:00Z');

  it('returns Today for same day', () => {
    expect(getRelativeDateLabel(new Date('2026-05-26T22:00:00Z'), now, TZ)).toBe('Today');
  });

  it('returns Tomorrow for next day', () => {
    expect(getRelativeDateLabel(new Date('2026-05-27T21:15:00Z'), now, TZ)).toBe('Tomorrow');
  });

  it('returns weekday name within next 6 days', () => {
    expect(getRelativeDateLabel(new Date('2026-05-28T21:15:00Z'), now, TZ)).toBe('Thursday');
    expect(getRelativeDateLabel(new Date('2026-05-29T14:15:00Z'), now, TZ)).toBe('Friday');
  });

  it('returns weekday + date 7+ days out', () => {
    expect(getRelativeDateLabel(new Date('2026-06-01T14:45:00Z'), now, TZ)).toBe('Mon, Jun 1');
  });

  it('handles DST spring-forward correctly', () => {
    // DST starts Sun Mar 8 2026 in US. Anchor: Sat Mar 7 2026 noon EST.
    const dstNow = new Date('2026-03-07T17:00:00Z');
    expect(getRelativeDateLabel(new Date('2026-03-08T15:00:00Z'), dstNow, TZ)).toBe('Tomorrow');
    expect(getRelativeDateLabel(new Date('2026-03-09T15:00:00Z'), dstNow, TZ)).toBe('Monday');
  });

  it('handles DST fall-back correctly', () => {
    // DST ends Sun Nov 1 2026. Anchor: Sat Oct 31 2026 noon EDT.
    const dstNow = new Date('2026-10-31T16:00:00Z');
    expect(getRelativeDateLabel(new Date('2026-11-01T16:00:00Z'), dstNow, TZ)).toBe('Tomorrow');
  });
});