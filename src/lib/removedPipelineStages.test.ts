import { describe, it, expect } from 'vitest';
import { foldRemovedStageDurations } from './removedPipelineStages';

describe('foldRemovedStageDurations', () => {
  it('adds Initial Feedback and Proposal In Development time to Initial Lender Review', () => {
    const out = foldRemovedStageDurations([
      { deal_id: 'a', key: 'initial-lender-review', changed_at: '2026-01-01', days: 5 },
      { deal_id: 'a', key: 'initial-feedback', changed_at: '2026-01-06', days: 3 },
      { deal_id: 'a', key: 'proposal-in-development', changed_at: '2026-01-09', days: 2 },
    ]);
    expect(out).toEqual([{ deal_id: 'a', key: 'initial-lender-review', changed_at: '2026-01-01', days: 10 }]);
  });

  it('re-keys Client Strategy Review to Final Credit Items when it has no prior row', () => {
    const out = foldRemovedStageDurations([
      { deal_id: 'b', key: 'Client Strategy Review', changed_at: '2026-02-01', days: 4 },
    ]);
    expect(out[0].key).toBe('final-credit-items');
    expect(out[0].days).toBe(4);
  });
});
