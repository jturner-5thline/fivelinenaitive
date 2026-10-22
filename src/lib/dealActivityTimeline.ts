// Pure helpers for the Deal Space activity line chart.
import { format, startOfDay, startOfWeek, subDays, subWeeks, addDays, addWeeks } from 'date-fns';

export type ActivityKind = 'client_meeting' | 'lender_meeting' | 'title_meeting' | 'lender_stage' | 'lender_email';

export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  client_meeting: 'Client meetings',
  lender_meeting: 'Funding source meetings',
  title_meeting: 'Deal-titled meetings',
  lender_stage: 'Lender stage moves',
  lender_email: 'Funding source emails',
};

export interface ActivityEvent { at: string; kind: ActivityKind; key: string }

const GENERIC_DOMAINS = new Set(['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'aol.com', 'me.com', 'live.com', 'msn.com', 'protonmail.com']);

export function emailDomain(email?: string | null): string | null {
  const m = (email || '').trim().toLowerCase().match(/@([^@\s>]+)$/);
  return m ? m[1] : null;
}

export function websiteDomain(url?: string | null): string | null {
  if (!url) return null;
  const d = url.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
  return d && d.includes('.') ? d : null;
}

export function isGenericDomain(d: string | null) { return !d || GENERIC_DOMAINS.has(d); }

/** Normalises calendar attendee payloads (strings or {email}) to lowercase emails. */
export function attendeeEmails(attendees: unknown): string[] {
  if (!Array.isArray(attendees)) return [];
  return attendees
    .map((a) => (typeof a === 'string' ? a : (a as { email?: string })?.email))
    .filter((e): e is string => !!e)
    .map((e) => e.trim().toLowerCase());
}

/** Matches an email against exact emails or non-generic domains. */
export function matchesParty(email: string, emails: Set<string>, domains: Set<string>) {
  if (emails.has(email)) return true;
  const d = emailDomain(email);
  return !!d && !isGenericDomain(d) && domains.has(d);
}

/** Whether a calendar title references the deal name (whole-word, case-insensitive). */
export function titleMentionsDeal(title: string | null | undefined, dealName: string) {
  const name = dealName.trim();
  if (!title || name.length < 3) return false;
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, 'i').test(title);
}

export type Granularity = 'daily' | 'weekly';
export interface ActivityBucket { key: string; label: string; total: number; counts: Record<ActivityKind, number> }

const emptyCounts = (): Record<ActivityKind, number> => ({ client_meeting: 0, lender_meeting: 0, title_meeting: 0, lender_stage: 0, lender_email: 0 });

/** Buckets de-duplicated events into 30 days or 12 weeks ending at `now`. */
export function bucketActivity(events: ActivityEvent[], granularity: Granularity, now = new Date()): ActivityBucket[] {
  const daily = granularity === 'daily';
  const startOf = (d: Date) => (daily ? startOfDay(d) : startOfWeek(d, { weekStartsOn: 1 }));
  const count = daily ? 30 : 12;
  const first = daily ? subDays(startOf(now), count - 1) : subWeeks(startOf(now), count - 1);
  const buckets: ActivityBucket[] = [];
  const index = new Map<string, ActivityBucket>();
  for (let i = 0; i < count; i++) {
    const d = daily ? addDays(first, i) : addWeeks(first, i);
    const key = format(d, 'yyyy-MM-dd');
    const b = { key, label: format(d, 'MMM d'), total: 0, counts: emptyCounts() };
    buckets.push(b); index.set(key, b);
  }
  const seen = new Set<string>();
  for (const e of events) {
    if (seen.has(e.key)) continue;
    seen.add(e.key);
    const at = new Date(e.at);
    if (isNaN(at.getTime())) continue;
    const b = index.get(format(startOf(at), 'yyyy-MM-dd'));
    if (!b) continue;
    b.counts[e.kind] += 1; b.total += 1;
  }
  return buckets;
}
