/**
 * Gmail "all mail" search hook.
 *
 * Default inbox loading is intentionally restricted to the INBOX label so the
 * inbox view stays clean (no spam/trash/sent). But that means archived mail
 * and emails moved to user labels (e.g. "Censys", "Lenders", "Deals") become
 * invisible to the in-memory keyword/AI search.
 *
 * When the user types a search query, this hook fires a single Gmail list
 * request with `search_all_mail=true` (no INBOX restriction). The returned
 * messages are mapped to `MockEmail` and merged into the search candidate set
 * so labeled / archived mail surfaces in results — exactly what would happen
 * if the same query were typed into Gmail's own search bar.
 *
 * The fetch is debounced and de-duplicated per query string. Failures are
 * silent: if the search fetch fails or rate-limits, we just fall back to the
 * already-loaded inbox candidates.
 */
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { MockEmail } from '@/components/deal/email/mockEmailData';

const DEBOUNCE_MS = 400;
const MAX_RESULTS = 50;
const SEARCH_WINDOW_DAYS = 90;
const CACHE_SIZE = 5;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min in-memory only

// Module-level LRU cache (session-only, never persisted).
type CacheEntry = { results: MockEmail[]; ts: number };
const searchCache = new Map<string, CacheEntry>();

function getCached(key: string): MockEmail[] | null {
  const hit = searchCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > CACHE_TTL_MS) {
    searchCache.delete(key);
    return null;
  }
  // refresh LRU position
  searchCache.delete(key);
  searchCache.set(key, hit);
  return hit.results;
}

function setCached(key: string, results: MockEmail[]) {
  if (searchCache.has(key)) searchCache.delete(key);
  searchCache.set(key, { results, ts: Date.now() });
  while (searchCache.size > CACHE_SIZE) {
    const oldestKey = searchCache.keys().next().value;
    if (oldestKey === undefined) break;
    searchCache.delete(oldestKey);
  }
}

// Gmail search operators that signal the user already scoped by date —
// in those cases we must NOT inject our default 90-day window.
const DATE_OPERATOR_RE = /\b(?:after|before|older|newer|older_than|newer_than|on)\s*[:=]/i;

// Gmail search operators — if the user already typed one (from:, to:, subject:,
// has:, label:, etc.), don't expand the query.
const GMAIL_OPERATOR_RE = /\b(?:from|to|cc|bcc|subject|in|is|has|label|list|filename|category|deliveredto|rfc822msgid|larger|smaller)\s*:/i;

function formatGmailDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

// Short, name-like queries get expanded so inbound mail matches even when the
// sender's display name in their own account isn't the full phrase the user
// typed. Without this, searching "Matt Rich" returns Niki→Matt threads (To
// header has "Matt Rich") but misses Matt→Niki threads if Matt's Gmail
// display name is just "Matt".
function expandPhraseQuery(raw: string): string {
  if (GMAIL_OPERATOR_RE.test(raw)) return raw;
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  if (trimmed.includes('"')) return raw; // user already quoted
  if (trimmed.includes('@')) return raw; // bare email — Gmail handles it
  const words = trimmed.split(/\s+/);
  if (words.length < 1 || words.length > 3) return raw;
  const phrase = `"${trimmed}"`;
  return `(${phrase} OR from:${phrase} OR to:${phrase} OR cc:${phrase})`;
}

function scopeQuery(raw: string): string {
  const expanded = expandPhraseQuery(raw);
  if (DATE_OPERATOR_RE.test(expanded)) return expanded;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - SEARCH_WINDOW_DAYS);
  return `${expanded} after:${formatGmailDate(cutoff)}`;
}

function mapToMockEmail(msg: any): MockEmail | null {
  if (!msg || !msg.id) return null;
  const labels: string[] = Array.isArray(msg.labels) ? msg.labels : [];
  // Reflect the email's actual storage location so the inbox row can render
  // a small chip (Archived / <Label>) when this came from a search hit
  // outside the INBOX folder.
  let folder: MockEmail['folder'] = 'inbox';
  const labelSet = new Set(labels.map((l) => String(l).toUpperCase()));
  if (labelSet.has('TRASH')) folder = 'trash';
  else if (labelSet.has('SPAM')) folder = 'junk';
  else if (labelSet.has('DRAFT')) folder = 'drafts';
  else if (labelSet.has('SENT') && !labelSet.has('INBOX')) folder = 'sent';
  return {
    id: msg.id,
    threadId: msg.thread_id || msg.id,
    provider_thread_id: msg.thread_id || null,
    subject: msg.subject || '(No subject)',
    from_name: msg.from_name || msg.from_email || 'Unknown',
    from_email: msg.from_email || '',
    to_name: (msg.to_names || msg.to_emails || [])[0] || 'You',
    to_email: (msg.to_emails || [])[0] || '',
    snippet: msg.snippet || '',
    body_preview: msg.body_text || msg.body_html || msg.snippet || '',
    body_html: msg.body_html || undefined,
    body_text: msg.body_text || undefined,
    body_loaded: !!(msg.body_html || msg.body_text),
    received_at: msg.received_at || new Date().toISOString(),
    is_read: msg.is_read ?? true,
    is_starred: msg.is_starred ?? false,
    folder,
    labels,
    has_attachments: !!msg.has_attachments,
    attachments: Array.isArray(msg.attachments) ? msg.attachments : undefined,
    is_linked_to_deal: false,
    is_follow_up: false,
    needs_response: false,
    category: 'deal' as const,
  };
}

export function useGmailAllMailSearch(query: string, enabled: boolean) {
  const [results, setResults] = useState<MockEmail[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const lastQueryRef = useRef<string>('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!enabled || !trimmed) {
      if (lastQueryRef.current) {
        lastQueryRef.current = '';
        setResults([]);
      }
      return;
    }
    if (trimmed === lastQueryRef.current) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Instant cache hit: render immediately, then refresh in background.
    const cached = getCached(trimmed);
    if (cached) {
      lastQueryRef.current = trimmed;
      setResults(cached);
    }

    const handle = window.setTimeout(async () => {
      setIsSearching(true);
      try {
        const scopedQuery = scopeQuery(trimmed);
        const { data, error } = await supabase.functions.invoke('gmail-messages', {
          body: {
            action: 'list',
            max_results: MAX_RESULTS,
            query: scopedQuery,
            search_all_mail: true,
          },
        });
        if (ctrl.signal.aborted) return;
        if (error || data?.fallback) {
          // Silent failure — keep showing in-memory results.
          return;
        }
        const mapped = (data?.messages || [])
          .map(mapToMockEmail)
          .filter((e: MockEmail | null): e is MockEmail => !!e);
        lastQueryRef.current = trimmed;
        setCached(trimmed, mapped);
        setResults(mapped);
      } catch {
        /* network blip — keep prior results */
      } finally {
        if (!ctrl.signal.aborted) setIsSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(handle);
      ctrl.abort();
    };
  }, [query, enabled]);

  return { results, isSearching };
}