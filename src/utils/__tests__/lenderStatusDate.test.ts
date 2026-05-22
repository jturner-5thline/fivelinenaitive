import { describe, it, expect } from 'vitest';
import { formatShortDate, getPrimaryStatusDate, buildStatusTimeline } from '../lenderStatusDate';
import type { DealLender } from '@/types/deal';

const base: DealLender = {
  id: 'l1', name: 'Acme', status: 'in-review', stage: 'reviewing-drl', trackingStatus: 'active',
};

describe('lenderStatusDate', () => {
  it('hides year in current year, shows it otherwise', () => {
    const thisYear = new Date().getFullYear();
    expect(formatShortDate(`${thisYear}-04-14T12:00:00Z`)).toMatch(/Apr/);
    expect(formatShortDate(`${thisYear}-04-14T12:00:00Z`)).not.toContain(`${thisYear}`);
    expect(formatShortDate('2024-04-14T12:00:00Z')).toContain('2024');
  });

  it('falls back to updatedAt for active lenders with an approximate flag when no dedicated status timestamp exists', () => {
    const r = getPrimaryStatusDate({ ...base, updatedAt: '2026-01-01T00:00:00Z' });
    expect(r.approximate).toBe(true);
    expect(r.label).toBe('Submitted');
  });

  it('prefers passedAt for a passed lender', () => {
    const r = getPrimaryStatusDate({ ...base, trackingStatus: 'passed', passedAt: '2026-05-02T00:00:00Z' });
    expect(r.label).toBe('Passed');
    expect(r.iso).toContain('2026-05-02');
    expect(r.approximate).toBe(false);
  });

  it('builds a sorted timeline (desc) from available timestamps', () => {
    const events = buildStatusTimeline({
      ...base,
      createdAt: '2026-01-01T00:00:00Z',
      submittedAt: '2026-02-01T00:00:00Z',
      passedAt: '2026-03-01T00:00:00Z',
    });
    expect(events.map(e => e.kind)).toEqual(['passed', 'submitted', 'created']);
  });
});