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

  // Required regression cases from the stale-alert spec:
  // (1) Lender in "On Deck" on an Active deal → MUST NOT notify.
  // (2) Lender in "Contacted" on an Archived deal → MUST NOT notify.
  it('On Deck lender on Active deal is not eligible', () => {
    const onDeckLender = { stage: 'On Deck', trackingStatus: 'active', is_archived: false };
    const activeDeal = { status: 'on-track', stage: 'submitted-to-lenders', is_archived: false };
    expect(isLenderEligibleForAttention(onDeckLender, activeDeal)).toBe(false);
  });

  it('Contacted lender on Archived deal is not eligible', () => {
    const contactedLender = { stage: 'Contacted', trackingStatus: 'active', is_archived: false };
    const archivedDeal = { status: 'archived', stage: 'submitted-to-lenders', is_archived: true };
    expect(isLenderEligibleForAttention(contactedLender, archivedDeal)).toBe(false);
  });

  it('On Hold lender on any deal is not eligible', () => {
    const onHoldLender = { stage: 'On Hold', trackingStatus: 'on-hold', is_archived: false };
    const activeDeal = { status: 'on-track', stage: 'submitted-to-lenders', is_archived: false };
    expect(isLenderEligibleForAttention(onHoldLender, activeDeal)).toBe(false);
  });

  it('suppresses ALL lenders on Closed Won / Closed Lost deals (regardless of lender stage)', () => {
    const closedWonDeal = { status: 'closed-won', stage: 'closed-won' };
    const closedLostDeal = { status: 'closed_lost', stage: 'submitted-to-lenders' };
    const activeLender = { stage: 'in-review', trackingStatus: 'active' };
    expect(isLenderEligibleForAttention(activeLender, closedWonDeal)).toBe(false);
    expect(isLenderEligibleForAttention(activeLender, closedLostDeal)).toBe(false);
  });

  it('suppresses lenders when deal stage encodes closed-won/closed-lost', () => {
    const stagedWon = { status: 'on-track', stage: 'closed-won' };
    const stagedLost = { status: 'on-track', stage: 'closed-lost' };
    const activeLender = { stage: 'in-review', trackingStatus: 'active' };
    expect(isLenderEligibleForAttention(activeLender, stagedWon)).toBe(false);
    expect(isLenderEligibleForAttention(activeLender, stagedLost)).toBe(false);
  });
});
