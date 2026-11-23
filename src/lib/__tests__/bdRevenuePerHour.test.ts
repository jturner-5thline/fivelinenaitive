import { describe, it, expect } from 'vitest';
import { buildBdRevenueTree, formatBdLag, isBdReferralInRange, meetingHours } from '../bdRevenuePerHour';

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

  it('averages Jan 10 and Feb 10 meetings to a Mar 1 referral as 34.5 days', () => {
    const at = (id: string, date: string) => ({ ...meet(id, 1), start: `${date}T10:00:00Z`, end: `${date}T11:00:00Z` });
    const tree = buildBdRevenueTree([src()], new Map(), [at('jan', '2026-01-10'), at('feb', '2026-02-10'), at('after', '2026-03-02')], new Map([['d1', '2026-03-01T10:00:00Z']]));
    for (const node of [tree[0], tree[0].children[0], tree[0].children[0].children[0]]) {
      expect(node.avgLagDays).toBe(34.5);
      expect(node.lagPairs).toBe(2);
      expect(node.meetings).toBe(3);
      expect(node.meetingsPerDeal).toBe(3);
    }
  });

  it('six meetings for two referrals gives 3.0 meetings per deal', () => {
    const tree = buildBdRevenueTree([src({ dealIds: ['d1', 'd2'] })], new Map(), Array.from({ length: 6 }, (_, i) => meet(`m${i}`, 1)));
    expect(tree[0].meetingsPerDeal).toBe(3);
  });

  it('pairs meetings with every subsequent referral and weights by pairs, not contact averages', () => {
    const tree = buildBdRevenueTree([src({ dealIds: ['d1', 'd2'] }), src({ contactId: 'c2', emails: ['b@boa.com'], dealIds: ['d3'] })], new Map(),
      [meet('m1', 1), meet('m2', 1, ['b@boa.com'])], new Map([
        ['d1', '2026-01-11T10:00:00Z'], ['d2', '2026-01-21T10:00:00Z'], ['d3', '2026-01-31T10:00:00Z'],
      ]));
    expect(tree[0].avgLagDays).toBe(20);
    expect(tree[0].lagPairs).toBe(3);
  });

  it('deduplicates shared meeting/referral pairs across companies and the channel', () => {
    const tree = buildBdRevenueTree([src({ dealIds: ['d1', 'd1'] }), src({ contactId: 'c2', companyKey: 'other', emails: ['b@boa.com'] })], new Map([['d1', 1000]]),
      [meet('m1', 1, ['armen@boa.com', 'b@boa.com']), meet('m1', 1, ['armen@boa.com', 'b@boa.com'])], new Map([['d1', '2026-01-11T10:00:00Z']]));
    expect(tree[0].meetings).toBe(1);
    expect(tree[0].deals).toBe(1);
    expect(tree[0].revenue).toBe(1000);
    expect(tree[0].lagPairs).toBe(1);
    expect(tree[0].avgLagDays).toBe(10);
  });

  it('does not pair a colleague-only meeting with another contact’s referral', () => {
    const tree = buildBdRevenueTree([src(), src({ contactId: 'c2', emails: ['b@boa.com'], dealIds: ['d2'] })], new Map(),
      [meet('m1', 1, ['b@boa.com'])], new Map([['d1', '2026-01-11T10:00:00Z'], ['d2', '2025-12-01T10:00:00Z']]));
    expect(tree[0].lagPairs).toBe(0);
    expect(tree[0].avgLagDays).toBeNull();
  });

  it('uses linked IDs without email and excludes invalid/all-day durations from meeting counts', () => {
    const tree = buildBdRevenueTree([src({ emails: [] })], new Map(), [
      { ...meet('linked', 1, []), matchedContactId: 'c1' },
      { ...meet('invalid', 1, []), matchedContactId: 'c1', end: null },
      { ...meet('all-day', 24, []), matchedContactId: 'c1' },
    ], new Map([['d1', '2026-01-11T10:00:00Z']]));
    expect(tree[0].meetings).toBe(1);
    expect(tree[0].avgLagDays).toBe(10);
  });

  it('missing/invalid NDA dates and meetings at the referral instant have no lag sample', () => {
    for (const date of [undefined, 'invalid', '2026-01-01T10:00:00Z']) {
      const nda = date ? new Map([['d1', date]]) : new Map<string, string>();
      expect(buildBdRevenueTree([src()], new Map(), [meet('m', 1)], nda)[0].avgLagDays).toBeNull();
    }
  });
});

describe('NDA referral timeframe', () => {
  it('includes boundary dates and excludes missing or out-of-period entries', () => {
    const start = new Date('2026-01-01T00:00:00Z'), end = new Date('2026-01-31T23:59:59Z');
    expect(isBdReferralInRange(start.toISOString(), start, end)).toBe(true);
    expect(isBdReferralInRange(end.toISOString(), start, end)).toBe(true);
    expect(isBdReferralInRange('2026-02-01T00:00:00Z', start, end)).toBe(false);
    expect(isBdReferralInRange(null, start, end)).toBe(false);
    expect(isBdReferralInRange('invalid', null, null)).toBe(false);
  });
  it('formats lag in days or weeks above 30 days, with unavailable distinct from zero', () => {
    expect(formatBdLag(14)).toBe('14d');
    expect(formatBdLag(35)).toBe('5.0 wks');
    expect(formatBdLag(0)).toBe('0d');
    expect(formatBdLag(null)).toBe('—');
  });
});
