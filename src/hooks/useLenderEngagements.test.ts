import { describe, it, expect } from 'vitest';
import { dedupeImportedEmails, engagementSourceUrl } from './useLenderEngagements';

describe('lender engagement helpers', () => {
  it('dedupes imported emails on contact, time and subject', () => {
    const rows = [
      { id: '1', contact_id: 'a', occurred_at: '2026-07-01T10:00:00Z', subject: 'Hi' },
      { id: '2', contact_id: 'a', occurred_at: '2026-07-01T10:00:00.000Z', subject: 'Hi' },
      { id: '3', contact_id: 'b', occurred_at: '2026-07-01T10:00:00Z', subject: 'Hi' },
      { id: '4', contact_id: 'a', occurred_at: '2026-07-01T10:00:00Z', subject: 'Re: Hi' },
    ];
    expect(dedupeImportedEmails(rows).map((r) => r.id)).toEqual(['1', '3', '4']);
  });
  it('builds source links only for known refs', () => {
    expect(engagementSourceUrl('gmail:abc')).toContain('abc');
    expect(engagementSourceUrl('gcal:x')).toBeNull();
    expect(engagementSourceUrl(null)).toBeNull();
  });
});
