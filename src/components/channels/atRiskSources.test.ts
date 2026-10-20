import { describe, it, expect } from 'vitest';
import { computeAtRiskSources, isRemovedForInactivity } from './atRiskSources';

const now = new Date('2026-10-19T00:00:00Z');
const d = (created_at: string, stage?: string) => ({ id: created_at, company: 'X', created_at, stage });

describe('computeAtRiskSources', () => {
  it('flags a source at the 4 month mark', () => {
    const rows = computeAtRiskSources([{ referredBy: 'A', deals: [d('2026-06-10T00:00:00Z')] }], now);
    expect(rows.map((r) => r.monthsSince)).toEqual([4]);
  });
  it('does not flag a source with a deal in the last 4 months', () => {
    expect(computeAtRiskSources([{ referredBy: 'F', deals: [d('2026-07-01T00:00:00Z')] }], now)).toEqual([]);
  });
  it('drops sources from at risk once they pass 6 months (removed)', () => {
    expect(computeAtRiskSources([{ referredBy: 'Old', deals: [d('2026-03-01T00:00:00Z')] }], now)).toEqual([]);
  });
  it('ignores deals that never reached NDA / Needs List', () => {
    const rows = computeAtRiskSources(
      [{ referredBy: 'S', deals: [d('2026-05-01T00:00:00Z', 'proposal-issued'), d('2026-09-01T00:00:00Z', 'lead')] }],
      now,
    );
    expect(rows.map((r) => r.monthsSince)).toEqual([5]);
  });
  it('flags a manually added source with no deals 4 months after it was added', () => {
    const rows = computeAtRiskSources([{ referredBy: 'M', addedAt: '2026-05-20T00:00:00Z', deals: [] }], now);
    expect(rows.map((r) => r.monthsSince)).toEqual([5]);
  });
});

describe('isRemovedForInactivity', () => {
  it('removes a source after 6 months with no deal', () => {
    expect(isRemovedForInactivity({ referredBy: 'Old', deals: [d('2026-04-01T00:00:00Z')] }, now)).toBe(true);
  });
  it('keeps a source with a deal 5 months ago', () => {
    expect(isRemovedForInactivity({ referredBy: 'A', deals: [d('2026-05-25T00:00:00Z')] }, now)).toBe(false);
  });
  it('does not remove a newly added source even if its old deals are 6+ months old', () => {
    expect(
      isRemovedForInactivity({ referredBy: 'New', addedAt: '2026-10-01T00:00:00Z', deals: [d('2025-01-01T00:00:00Z')] }, now),
    ).toBe(false);
  });
  it('removes a manually added source with no deal after 6 months', () => {
    expect(isRemovedForInactivity({ referredBy: 'M', addedAt: '2026-04-01T00:00:00Z', deals: [] }, now)).toBe(true);
  });
});
