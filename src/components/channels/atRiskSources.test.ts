import { describe, it, expect } from 'vitest';
import { computeAtRiskSources } from './atRiskSources';

const now = new Date('2026-10-19T00:00:00Z');
const d = (created_at: string) => ({ id: created_at, company: 'X', created_at });

describe('computeAtRiskSources', () => {
  it('flags sources whose last deal is 6+ months old', () => {
    const rows = computeAtRiskSources([{ referredBy: 'Old', deals: [d('2026-03-01T00:00:00Z')] }], now);
    expect(rows.map((r) => r.label)).toEqual(['Old']);
  });
  it('does not flag a source with a deal in the last 6 months', () => {
    const rows = computeAtRiskSources(
      [{ referredBy: 'Fresh', deals: [d('2025-01-01T00:00:00Z'), d('2026-08-01T00:00:00Z')] }],
      now,
    );
    expect(rows).toEqual([]);
  });
});
