import { describe, it, expect } from 'vitest';
import { bucketActivity, matchesParty, titleMentionsDeal, attendeeEmails } from '../dealActivityTimeline';

const now = new Date('2026-10-22T15:00:00');

describe('dealActivityTimeline', () => {
  it('daily view has 30 buckets and dedupes events', () => {
    const b = bucketActivity([
      { at: '2026-10-22T10:00:00', kind: 'client_meeting', key: 'a' },
      { at: '2026-10-22T10:00:00', kind: 'client_meeting', key: 'a' },
      { at: '2026-10-21T10:00:00', kind: 'lender_stage', key: 'b' },
    ], 'daily', now);
    expect(b).toHaveLength(30);
    expect(b[29].total).toBe(1);
    expect(b[28].counts.lender_stage).toBe(1);
  });
  it('weekly view has 12 buckets', () => {
    expect(bucketActivity([], 'weekly', now)).toHaveLength(12);
  });
  it('matches same-domain attendees but not generic domains', () => {
    const emails = new Set(['bob@gmail.com']); const domains = new Set(['acme.com', 'gmail.com']);
    expect(matchesParty('jane@acme.com', emails, domains)).toBe(true);
    expect(matchesParty('other@gmail.com', emails, domains)).toBe(false);
    expect(matchesParty('bob@gmail.com', emails, domains)).toBe(true);
  });
  it('detects deal name in title as a whole word', () => {
    expect(titleMentionsDeal('Acme <> Lender call', 'Acme')).toBe(true);
    expect(titleMentionsDeal('Acmeco sync', 'Acme')).toBe(false);
  });
  it('normalises attendee shapes', () => {
    expect(attendeeEmails(['A@x.com', { email: 'b@y.com' }])).toEqual(['a@x.com', 'b@y.com']);
  });
});
