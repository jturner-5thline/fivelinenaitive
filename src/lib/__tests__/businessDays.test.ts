import { describe, it, expect } from 'vitest';
import { businessDaysBetween, isStatusNoteStale } from '../businessDays';

describe('businessDaysBetween', () => {
  it('returns 0 when end <= start', () => {
    const d = new Date('2026-05-20T10:00:00');
    expect(businessDaysBetween(d, d)).toBe(0);
  });

  it('counts Mon→Thu as 3 business days', () => {
    expect(businessDaysBetween(new Date('2026-05-18'), new Date('2026-05-21'))).toBe(3);
  });

  it('skips weekends', () => {
    // Fri May 22 -> Mon May 25: 1 business day
    expect(businessDaysBetween(new Date('2026-05-22'), new Date('2026-05-25'))).toBe(1);
  });

  it('skips US federal holidays (Memorial Day Mon May 25 2026)', () => {
    // Fri May 22 -> Tue May 26: skip Sat/Sun/Memorial Day => 1 BD
    expect(businessDaysBetween(new Date('2026-05-22'), new Date('2026-05-26'))).toBe(1);
  });
});

describe('isStatusNoteStale', () => {
  it('null lastUpdatedAt is stale with Infinity', () => {
    const r = isStatusNoteStale(null, new Date('2026-05-24'));
    expect(r.stale).toBe(true);
    expect(r.businessDaysSince).toBe(Number.POSITIVE_INFINITY);
  });

  it('exactly 3 BD is NOT stale', () => {
    // Updated Mon May 18; today Thu May 21 → 3 BD
    const r = isStatusNoteStale(new Date('2026-05-18T14:00:00'), new Date('2026-05-21T14:00:00'));
    expect(r.businessDaysSince).toBe(3);
    expect(r.stale).toBe(false);
  });

  it('4 BD across a weekend IS stale', () => {
    // Updated Fri May 22 (post-update); today Thu May 28 → BDs: Mon, Tue (Memorial), Wed, Thu
    // Memorial day = May 25 2026 (holiday). Mon 5/25 skipped, Tue 5/26, Wed 5/27, Thu 5/28 = 3 BD
    // Use Fri May 15 -> Thu May 21 instead: Mon 18, Tue 19, Wed 20, Thu 21 = 4 BD
    const r = isStatusNoteStale(new Date('2026-05-15T14:00:00'), new Date('2026-05-21T14:00:00'));
    expect(r.businessDaysSince).toBe(4);
    expect(r.stale).toBe(true);
  });

  it('Worthy case: Fri May 22 2:03pm -> Sun May 24 = 0 BD (not stale)', () => {
    const r = isStatusNoteStale(new Date('2026-05-22T14:03:00'), new Date('2026-05-24T10:00:00'));
    expect(r.businessDaysSince).toBe(0);
    expect(r.stale).toBe(false);
  });

  it('Fri May 15 -> next Fri May 22 across a weekend = 5 BD stale', () => {
    const r = isStatusNoteStale(new Date('2026-05-15T10:00:00'), new Date('2026-05-22T10:00:00'));
    expect(r.businessDaysSince).toBe(5);
    expect(r.stale).toBe(true);
  });
});