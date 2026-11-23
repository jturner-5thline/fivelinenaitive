import { describe, it, expect } from 'vitest';
import { buildBdRevenueTree, meetingHours } from '../bdRevenuePerHour';

const src = (o: Partial<Parameters<typeof buildBdRevenueTree>[0][number]> = {}) => ({
  contactId: 'c1', contactName: 'Armen Krmzian', companyKey: 'boa', companyName: 'Bank of America', channel: 'Banks', dealIds: ['d1'], emails: ['armen@boa.com'], ...o,
});
const meet = (id: string, hours: number, emails = ['armen@boa.com']) => ({ id, start: '2026-01-01T10:00:00Z', end: new Date(Date.parse('2026-01-01T10:00:00Z') + hours * 3600000).toISOString(), attendeeEmails: emails, matchedContactId: null });

describe('buildBdRevenueTree', () => {
  it('$100,000 over 10 hours is $10,000/hour for contact, company and channel', () => {
    const tree = buildBdRevenueTree([src()], new Map([['d1', 100000]]), [meet('m1', 4), meet('m2', 6)]);
    expect(tree[0].perHour).toBe(10000);
    expect(tree[0].children[0].perHour).toBe(10000);
    expect(tree[0].children[0].children[0].perHour).toBe(10000);
  });
  it('a meeting with two contacts at one company counts once for the company', () => {
    const tree = buildBdRevenueTree([src(), src({ contactId: 'c2', contactName: 'B', emails: ['b@boa.com'], dealIds: ['d2'] })],
      new Map([['d1', 50000], ['d2', 50000]]), [meet('m1', 2, ['armen@boa.com', 'b@boa.com'])]);
    expect(tree[0].children[0].hours).toBe(2);
    expect(tree[0].children[0].perHour).toBe(50000);
  });
  it('revenue with no hours has no per-hour figure', () => {
    expect(buildBdRevenueTree([src()], new Map([['d1', 1000]]), [])[0].perHour).toBeNull();
  });
  it('ignores meetings without an end or longer than 12 hours', () => {
    expect(meetingHours({ start: '2026-01-01T00:00:00Z', end: null })).toBe(0);
    expect(meetingHours({ start: '2026-01-01T00:00:00Z', end: '2026-01-02T00:00:00Z' })).toBe(0);
  });
});
