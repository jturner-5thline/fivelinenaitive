/**
 * Demo-only lender contact backfill.
 *
 * The demo workspace must NEVER show a blank lender contact name in any
 * UI surface, report, or AI response. When a lender (master_lenders) or
 * lender_contacts row is loaded for the demo user and the contact name
 * is missing/empty, we deterministically synthesize a plausible
 * "First Last" pair from the lender's stable identifier so the same
 * lender always gets the same fake contact across pipeline, lender
 * detail, AI responses, and emails.
 *
 * Scoped strictly to demo@5thline.co — see DEMO_PRIMARY_EMAIL.
 */
import { DEMO_PRIMARY_EMAIL } from './demoAccount';

const FIRST_NAMES = [
  'Alex', 'Taylor', 'Jordan', 'Morgan', 'Casey',
  'Riley', 'Avery', 'Cameron', 'Quinn', 'Devon',
] as const;

const LAST_NAMES = [
  'Mercer', 'Brooks', 'Hayes', 'Collins', 'Parker',
  'Martinez', 'Thompson', 'Foster', 'Anderson', 'Wright',
] as const;

/** Stable 32-bit hash from a string — deterministic across reloads. */
function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function isBlank(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v !== 'string') return false;
  const t = v.trim();
  if (!t) return true;
  // Treat common placeholder values as blank too.
  return /^(n\/?a|unknown|none|null|tbd|-+)$/i.test(t);
}

/** Returns true when the active user is the demo account. */
export function isDemoEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase() === DEMO_PRIMARY_EMAIL;
}

/**
 * Deterministic fake "First Last" derived from a stable lender key.
 * Pass the lender id when available, otherwise the lender name.
 */
export function demoFakeContactName(seed: string): { first: string; last: string; full: string } {
  const key = (seed || 'lender').toLowerCase();
  const h = hashString(key);
  const first = FIRST_NAMES[h % FIRST_NAMES.length];
  // Use a different bit-window so first/last don't lock-step.
  const last = LAST_NAMES[Math.floor(h / FIRST_NAMES.length) % LAST_NAMES.length];
  return { first, last, full: `${first} ${last}` };
}

/**
 * Backfill the `contact_name` field on a master_lenders row for demo users.
 * Returns the same row reference when no change is needed.
 */
export function withDemoLenderContact<T extends { id?: string | null; name?: string | null; contact_name?: string | null }>(
  lender: T,
  isDemo: boolean,
): T {
  if (!isDemo) return lender;
  if (!isBlank(lender.contact_name)) return lender;
  const seed = (lender.id ?? lender.name ?? '') as string;
  return { ...lender, contact_name: demoFakeContactName(seed).full };
}

/**
 * Backfill the `name` field on a lender_contacts row for demo users.
 * Seeds off the contact id (and falls back to lender_id) so the same
 * row always renders the same fake name.
 */
export function withDemoLenderContactRow<T extends { id?: string | null; lender_id?: string | null; name?: string | null }>(
  contact: T,
  isDemo: boolean,
): T {
  if (!isDemo) return contact;
  if (!isBlank(contact.name)) return contact;
  const seed = (contact.id ?? contact.lender_id ?? '') as string;
  return { ...contact, name: demoFakeContactName(seed).full };
}