import { describe, it, expect, beforeEach } from 'vitest';
import {
  persistDealOrigin,
  loadPersistedDealOrigin,
  clearPersistedDealOrigin,
  pushPendingReopen,
  consumePendingReopen,
  PENDING_REOPEN_SESSION_KEY,
  type DealOrigin,
} from '../dealOriginContext';

// jsdom provides window.sessionStorage in vitest's default env.

const sampleOrigin: DealOrigin = {
  label: 'Back to Signed Deals (Apr 2026)',
  returnTo: '/insights',
  reopen: {
    source: 'insights.signed-deals-and-ar',
    bucketKey: 'deals-signed|2026-04',
    bucketLabel: 'Apr 2026',
    quarterId: '2026-Q2',
  },
};

describe('dealOriginContext', () => {
  beforeEach(() => sessionStorage.clear());

  it('persists and reads the deal origin per deal id', () => {
    persistDealOrigin('abc', sampleOrigin);
    expect(loadPersistedDealOrigin('abc')).toEqual(sampleOrigin);
    expect(loadPersistedDealOrigin('other')).toBeNull();
  });

  it('clears persisted origin on demand', () => {
    persistDealOrigin('abc', sampleOrigin);
    clearPersistedDealOrigin('abc');
    expect(loadPersistedDealOrigin('abc')).toBeNull();
  });

  it('returns null for malformed storage payloads', () => {
    sessionStorage.setItem('deal-origin:bad', 'not-json');
    expect(loadPersistedDealOrigin('bad')).toBeNull();
    sessionStorage.setItem('deal-origin:bad2', JSON.stringify({ wrong: true }));
    expect(loadPersistedDealOrigin('bad2')).toBeNull();
  });

  it('pushes and consumes a pending reopen exactly once when matched', () => {
    pushPendingReopen(sampleOrigin.reopen!);
    const matched = consumePendingReopen(
      (r) => r.source === 'insights.signed-deals-and-ar',
    );
    expect(matched).toEqual(sampleOrigin.reopen);
    // Second consume must yield null (single-use).
    expect(
      consumePendingReopen(() => true),
    ).toBeNull();
    expect(sessionStorage.getItem(PENDING_REOPEN_SESSION_KEY)).toBeNull();
  });

  it('leaves pending reopen in storage when matcher rejects it', () => {
    pushPendingReopen(sampleOrigin.reopen!);
    expect(consumePendingReopen(() => false)).toBeNull();
    // Still present for a later matching consumer.
    expect(sessionStorage.getItem(PENDING_REOPEN_SESSION_KEY)).not.toBeNull();
  });
});