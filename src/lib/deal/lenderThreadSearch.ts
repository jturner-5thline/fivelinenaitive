import { supabase } from '@/integrations/supabase/client';

export interface LenderThreadMatch {
  thread_id: string;
  latest_message_id: string;
  subject: string;
  latest_date: string | null; // ISO
  message_count: number;
  from_email: string;
  to_emails: string[];
  snippet?: string;
  /** Relevance score — higher = better match on deal keywords. */
  score: number;
  /** True when the deal name/keywords matched in the subject line. */
  subject_match: boolean;
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'inc', 'llc', 'lp', 'llp', 'co', 'corp', 'company',
  'group', 'holdings', 'holding', 'capital', 'partners', 'deal', 'project',
  'of', 'a', 'an', 'to', 're', 'fwd',
]);

/** Deal-identifying keyword tokens, longest/most distinctive first. */
export function buildDealKeywords(dealName?: string, company?: string): string[] {
  const tokens = new Set<string>();
  for (const raw of [dealName, company]) {
    const s = (raw || '').trim();
    if (!s) continue;
    tokens.add(s.toLowerCase());
    for (const t of s.toLowerCase().split(/[^a-z0-9&]+/)) {
      if (t.length >= 3 && !STOPWORDS.has(t)) tokens.add(t);
    }
  }
  return Array.from(tokens).sort((a, b) => b.length - a.length);
}

function normalizeSubject(s: string): string {
  return (s || '').replace(/^(\s*(re|fwd|fw)\s*:\s*)+/i, '').trim();
}

function toIso(m: any): string | null {
  const ts = m?.received_at || m?.date || m?.internal_date;
  if (!ts) return null;
  if (typeof ts === 'number') return new Date(ts < 1e12 ? ts * 1000 : ts).toISOString();
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function listMessages(query: string, max: number): Promise<any[]> {
  const { data } = await supabase.functions.invoke('gmail-messages', {
    body: { action: 'list', query, max_results: max, search_all_mail: true },
  });
  return (data?.messages || data?.data || []) as any[];
}

async function listCachedMessages(domain: string, max: number): Promise<any[]> {
  const { data } = await supabase
    .from('email_cache')
    .select('gmail_message_id, thread_id, subject, snippet, from_email, to_emails, received_at')
    .ilike('from_email', `%@${domain}`)
    .order('received_at', { ascending: false })
    .limit(max);

  return (data || []).map((message) => ({
    ...message,
    id: message.gmail_message_id,
  }));
}

/**
 * Find the recent email threads with a funding source that relate to a deal.
 *
 * Strategy: query Gmail for correspondence with the lender's domain/email,
 * then rank threads locally by how strongly the SUBJECT line matches the deal
 * name / company keywords (subject matches weigh heaviest, body matches count
 * less, recency breaks ties). This is far more forgiving than requiring an
 * exact quoted deal-name phrase match in Gmail's search syntax.
 */
export async function searchLenderDealThreads(opts: {
  domain: string;
  email?: string;
  dealName?: string;
  company?: string;
  limit?: number;
  /**
   * When true, only keep threads that actually include a message directly
   * to or from the recipient's email address / domain. Used for client recap
   * drafts so keyword-only matches (e.g. lender threads mentioning the deal)
   * are never offered as the client conversation.
   */
  requireParticipant?: boolean;
}): Promise<LenderThreadMatch[]> {
  const { domain, email, dealName, company, requireParticipant } = opts;
  const limit = opts.limit ?? 6;
  if (!domain) return [];

  const keywords = buildDealKeywords(dealName, company);
  const scopes: string[] = [];
  if (email) scopes.push(`(from:${email} OR to:${email} OR cc:${email})`);
  scopes.push(`(from:${domain} OR to:${domain} OR cc:${domain})`);
  // Recipient metadata is not always complete on older cached/synced mail.
  // Search the mailbox by the distinctive deal terms as well so a client
  // conversation such as "RE: ODK & 5th Line" is still offered even when its
  // participants were not resolved from the deal's legacy contact fields.
  for (const keyword of keywords.slice(0, 3)) {
    scopes.push(`subject:"${keyword.replace(/"/g, '')}"`);
  }

  const seen = new Set<string>();
  const messages: any[] = [];
  // The local mailbox cache is both faster and more reliable than a live
  // provider search, and includes other contacts at the same lender domain.
  try {
    const cached = await listCachedMessages(domain, 80);
    for (const message of cached) {
      const id = message?.id || message?.message_id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      messages.push(message);
    }
  } catch {
    // Continue with live mailbox search when the cache is unavailable.
  }
  for (const scope of scopes) {
    try {
      const items = await listMessages(scope, 40);
      for (const m of items) {
        const id = m?.id || m?.message_id;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        messages.push(m);
      }
    } catch {
      // ignore this scope; try the next one
    }
  }
  if (messages.length === 0) return [];

  const byThread = new Map<string, LenderThreadMatch>();
  for (const m of messages) {
    const tid = m.thread_id || m.id;
    if (!tid) continue;
    const dateIso = toIso(m);
    const subject = m.subject || '';
    const existing = byThread.get(tid);
    if (!existing) {
      byThread.set(tid, {
        thread_id: tid,
        latest_message_id: m.id,
        subject: subject || '(no subject)',
        latest_date: dateIso,
        message_count: 1,
        from_email: m.from_email || (Array.isArray(m.from) ? m.from[0]?.email : m.from?.email) || '',
        to_emails: m.to_emails || [],
        snippet: m.snippet || m.body_preview || undefined,
        score: 0,
        subject_match: false,
      });
    } else {
      existing.message_count += 1;
      const newer = dateIso && (!existing.latest_date || dateIso > existing.latest_date);
      if (newer) {
        existing.latest_message_id = m.id;
        existing.latest_date = dateIso;
        existing.subject = subject || existing.subject;
        existing.from_email = m.from_email || existing.from_email;
        existing.to_emails = m.to_emails || existing.to_emails;
        existing.snippet = m.snippet || m.body_preview || existing.snippet;
      }
    }
  }

  const now = Date.now();
  const threads = Array.from(byThread.values()).map((t) => {
    const subj = normalizeSubject(t.subject).toLowerCase();
    const snip = (t.snippet || '').toLowerCase();
    let score = 0;
    let subjectMatch = false;
    for (const kw of keywords) {
      if (subj.includes(kw)) {
        score += 10 + Math.min(kw.length, 20);
        subjectMatch = true;
      } else if (snip.includes(kw)) {
        score += 3;
      }
    }
    const intendedEmail = (email || '').trim().toLowerCase();
    const participantEmails = [t.from_email, ...t.to_emails].map((value) => (value || '').toLowerCase());
    if (intendedEmail && participantEmails.includes(intendedEmail)) {
      score += 12;
    } else if (participantEmails.some((value) => value.endsWith(`@${domain.toLowerCase()}`))) {
      score += 6;
    }
    // Recency bonus: up to 5 points, decaying over ~90 days.
    if (t.latest_date) {
      const ageDays = (now - new Date(t.latest_date).getTime()) / 86_400_000;
      score += Math.max(0, 5 - ageDays / 18);
    }
    return { ...t, score, subject_match: subjectMatch };
  });

  const domainSuffix = `@${domain.toLowerCase()}`;
  const intended = (email || '').trim().toLowerCase();
  const scoped = requireParticipant
    ? threads.filter((t) => {
        const participants = [t.from_email, ...(t.to_emails || [])]
          .map((value) => (value || '').toLowerCase())
          .filter(Boolean);
        return participants.some(
          (value) => (intended && value.includes(intended)) || value.endsWith(domainSuffix),
        );
      })
    : threads;

  const matched = scoped.filter((t) => t.subject_match);
  const pool = matched.length > 0 ? matched : scoped.filter((t) => t.score > 3.5);
  const fallback = pool.length > 0 ? pool : (requireParticipant ? scoped : threads);

  return fallback
    .sort((a, b) => (b.score - a.score) || (b.latest_date || '').localeCompare(a.latest_date || ''))
    .slice(0, limit);
}
