/**
 * BD revenue per hour: referred-deal fee revenue and calendar BD hours rolled
 * up Contact -> Company -> Channel. Pure functions (tested).
 */
export interface BdSourceInput {
  contactId: string | null;
  contactName: string;
  companyKey: string; // crm company id or normalized name
  companyName: string;
  channel: string;
  dealIds: string[];
  emails: string[];
}
export interface BdMeetingInput { id: string; start: string | null; end: string | null; attendeeEmails: string[]; matchedContactId: string | null }
export interface BdNode { key: string; label: string; revenue: number; hours: number; deals: number; perHour: number | null; meetings: number; meetingsPerDeal: number | null; avgLagDays: number | null; lagPairs: number; children: BdNode[] }

/** Stage-history dates only: missing/invalid dates never fall back to CRM creation. */
export function isBdReferralInRange(ndaEnteredAt: string | null, start: Date | null, end: Date | null): boolean {
  if (!ndaEnteredAt) return false;
  const at = Date.parse(ndaEnteredAt);
  return Number.isFinite(at) && (!start || at >= start.getTime()) && (!end || at <= end.getTime());
}

export function formatBdLag(days: number | null): string {
  if (days === null) return '—';
  return days > 30 ? `${(days / 7).toFixed(1)} wks` : `${Number(days.toFixed(1))}d`;
}

export function meetingHours(m: { start: string | null; end: string | null }): number {
  if (!m.start || !m.end) return 0;
  const h = (new Date(m.end).getTime() - new Date(m.start).getTime()) / 3_600_000;
  return Number.isFinite(h) && h > 0 && h <= 12 ? h : 0;
}

const perHour = (rev: number, hrs: number) => (hrs > 0 ? rev / hrs : null);

export function buildBdRevenueTree(sources: BdSourceInput[], feeByDeal: Map<string, number>, meetings: BdMeetingInput[], ndaByDeal: Map<string, string> = new Map()): BdNode[] {
  // Hours per source (contact). A meeting counts once per contact; once per company/channel.
  const srcHours = new Map<number, Set<string>>();
  const meetingHrs = new Map<string, number>();
  meetings.forEach((m) => meetingHrs.set(m.id, meetingHours(m)));
  sources.forEach((s, i) => {
    const emails = new Set(s.emails.map((e) => e.toLowerCase()));
    const set = new Set<string>();
    for (const m of meetings) {
      if (meetingHours(m) > 0 && ((s.contactId && m.matchedContactId === s.contactId) || m.attendeeEmails.some((e) => emails.has(e.toLowerCase())))) set.add(m.id);
    }
    srcHours.set(i, set);
  });
  const sum = (ids: Set<string>) => [...ids].reduce((a, id) => a + (meetingHrs.get(id) || 0), 0);

  const meetingStarts = new Map(meetings.map(m => [m.id, m.start ? Date.parse(m.start) : NaN]));
  // A pair belongs to the referring contact. Parent unions deduplicate the same
  // meeting/deal pair without attributing another colleague's meetings to it.
  const pairsFor = (meet: Set<string>, deals: Set<string>) => {
    const pairs = new Map<string, number>();
    for (const deal of deals) {
      const nda = ndaByDeal.get(deal);
      if (!nda) continue;
      const referralAt = Date.parse(nda);
      if (!Number.isFinite(referralAt)) continue;
      for (const id of meet) {
        const at = meetingStarts.get(id);
        if (at !== undefined && Number.isFinite(at) && at < referralAt) pairs.set(JSON.stringify([id, deal]), (referralAt - at) / 86_400_000);
      }
    }
    return pairs;
  };
  const correlation = (meet: Set<string>, deals: Set<string>, pairs: Map<string, number>) => ({
    meetings: meet.size,
    meetingsPerDeal: deals.size > 0 ? meet.size / deals.size : null,
    avgLagDays: pairs.size > 0 ? [...pairs.values()].reduce((a, days) => a + days, 0) / pairs.size : null,
    lagPairs: pairs.size,
  });
  const channels = new Map<string, { label: string; meet: Set<string>; deals: Set<string>; pairs: Map<string, number>; companies: Map<string, { label: string; meet: Set<string>; deals: Set<string>; pairs: Map<string, number>; contacts: BdNode[] }> }>();
  sources.forEach((s, i) => {
    const ch = channels.get(s.channel) ?? { label: s.channel, meet: new Set(), deals: new Set(), pairs: new Map(), companies: new Map() };
    const co = ch.companies.get(s.companyKey) ?? { label: s.companyName, meet: new Set<string>(), deals: new Set<string>(), pairs: new Map(), contacts: [] };
    const m = srcHours.get(i) ?? new Set<string>();
    const deals = new Set(s.dealIds);
    const pairs = pairsFor(m, deals);
    pairs.forEach((days, key) => { co.pairs.set(key, days); ch.pairs.set(key, days); });
    const rev = [...deals].reduce((a, d) => a + (feeByDeal.get(d) || 0), 0);
    const hrs = sum(m);
    co.contacts.push({ key: s.contactId || `${s.companyKey}:${s.contactName}`, label: s.contactName, revenue: rev, hours: hrs, deals: deals.size, perHour: perHour(rev, hrs), ...correlation(m, deals, pairs), children: [] });
    m.forEach((id) => { co.meet.add(id); ch.meet.add(id); });
    s.dealIds.forEach((d) => { co.deals.add(d); ch.deals.add(d); });
    ch.companies.set(s.companyKey, co);
    channels.set(s.channel, ch);
  });
  const rev = (ids: Set<string>) => [...ids].reduce((a, d) => a + (feeByDeal.get(d) || 0), 0);
  const byRev = (a: BdNode, b: BdNode) => b.revenue - a.revenue || b.hours - a.hours;
  return [...channels.entries()].map(([k, ch]) => {
    const companies = [...ch.companies.entries()].map(([ck, co]) => {
      const r = rev(co.deals), h = sum(co.meet);
      return { key: ck, label: co.label, revenue: r, hours: h, deals: co.deals.size, perHour: perHour(r, h), ...correlation(co.meet, co.deals, co.pairs), children: co.contacts.sort(byRev) };
    }).sort(byRev);
    const r = rev(ch.deals), h = sum(ch.meet);
    return { key: k, label: ch.label, revenue: r, hours: h, deals: ch.deals.size, perHour: perHour(r, h), ...correlation(ch.meet, ch.deals, ch.pairs), children: companies };
  }).sort(byRev);
}
