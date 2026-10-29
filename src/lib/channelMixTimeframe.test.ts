import { describe, it, expect } from 'vitest';
import { channelMixWindow, ndaEnteredWithin } from './channelMixTimeframe';

const today = new Date(2026, 9, 29);

describe('channelMixWindow', () => {
  it('YTD starts January 1st of this year', () => {
    expect(channelMixWindow('ytd', today, null)!.start).toEqual(new Date(2026, 0, 1));
  });
  it('Last 6 Months starts 6 months before today', () => {
    expect(channelMixWindow('6m', today, null)!.start).toEqual(new Date(2026, 3, 29));
  });
  it('TTM starts 12 months before today', () => {
    expect(channelMixWindow('ttm', today, null)!.start).toEqual(new Date(2025, 9, 29));
  });
  it('Current uses the selected period', () => {
    const cur = { start: new Date(2026, 6, 1), end: new Date(2026, 8, 30) };
    expect(channelMixWindow('current', today, cur)).toBe(cur);
  });
});

describe('ndaEnteredWithin', () => {
  const win = channelMixWindow('ytd', today, null);
  it('excludes deals that never entered NDA', () => {
    expect(ndaEnteredWithin(null, win)).toBe(false);
  });
  it('excludes NDA entries from last year', () => {
    expect(ndaEnteredWithin('2025-12-31T12:00:00', win)).toBe(false);
  });
  it('includes NDA entries this year', () => {
    expect(ndaEnteredWithin('2026-02-10T12:00:00', win)).toBe(true);
  });
});
