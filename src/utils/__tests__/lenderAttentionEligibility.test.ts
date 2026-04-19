import { describe, it, expect } from 'vitest';
import { isLenderEligibleForAttention } from '../lenderAttentionEligibility';

describe('isLenderEligibleForAttention', () => {
  const validDeal = { status: 'on-track', stage: 'submitted-to-lenders', is_archived: false };
  const validLender = { stage: 'in-review', trackingStatus: 'active', is_archived: false };

  it('seeded scenario: only the valid In Review lender with stale follow-up is eligible', () => {
    const onDeckLender = { stage: 'On Deck', trackingStatus: 'active' };
    const onHoldLender = { stage: 'On Hold', trackingStatus: 'on-hold' };
    const lenderInArchivedDeal = { stage: 'In Review', trackingStatus: 'active' };
    const archivedDeal = { status: 'archived', stage: 'submitted-to-lenders' };
    const lenderInOnHoldDeal = { stage: 'In Review', trackingStatus: 'active' };
    const onHoldDeal = { status: 'on-hold', stage: 'submitted-to-lenders' };

    expect(isLenderEligibleForAttention(onDeckLender, validDeal)).toBe(false);
    expect(isLenderEligibleForAttention(onHoldLender, validDeal)).toBe(false);
    expect(isLenderEligibleForAttention(lenderInArchivedDeal, archivedDeal)).toBe(false);
    expect(isLenderEligibleForAttention(lenderInOnHoldDeal, onHoldDeal)).toBe(false);
    expect(isLenderEligibleForAttention(validLender, validDeal)).toBe(true);
  });

  it('excludes Passed, Not a Fit, Unresponsive, Excluded, Closed & Funded', () => {
    for (const stage of ['Passed', 'Not a Fit', 'Unresponsive', 'Excluded', 'Closed & Funded']) {
      expect(isLenderEligibleForAttention({ stage, trackingStatus: 'active' }, validDeal)).toBe(false);
    }
  });

  it('handles is_archived flags on deal and lender', () => {
    expect(isLenderEligibleForAttention({ ...validLender, is_archived: true }, validDeal)).toBe(false);
    expect(isLenderEligibleForAttention(validLender, { ...validDeal, is_archived: true })).toBe(false);
  });
});
