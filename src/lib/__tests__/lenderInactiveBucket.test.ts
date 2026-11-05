import { describe, it, expect } from 'vitest';
import { bucketInactiveDealLender } from '@/lib/lenderActiveDeals';

describe('bucketInactiveDealLender', () => {
  it('puts On Deck funding sources in On Deck, not Deals Sent', () => {
    expect(bucketInactiveDealLender({ stage: 'on-deck', trackingStatus: 'on-deck' })).toBe('on-deck');
    expect(bucketInactiveDealLender({ stage: 'abc123' }, 'On Deck')).toBe('on-deck');
  });
  it('puts Excluded funding sources in Excluded, not Deals Sent', () => {
    expect(bucketInactiveDealLender({ stage: 'excluded' })).toBe('excluded');
    expect(bucketInactiveDealLender({ stage: 'on-deck', excludedAt: '2026-01-01' })).toBe('excluded');
  });
  it('keeps passed funding sources in Deals Sent', () => {
    expect(bucketInactiveDealLender({ stage: 'passed', trackingStatus: 'passed' })).toBe('sent');
  });
});
