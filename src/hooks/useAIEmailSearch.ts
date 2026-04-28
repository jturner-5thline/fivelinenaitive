import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { MockEmail } from '@/components/deal/email/mockEmailData';

/**
 * AI-powered email search.
 *
 * Pipeline:
 *   1. Send the user's natural-language query + a compact list of candidate
 *      emails (id, sender, subject, snippet, date, folder) to Claude.
 *   2. Claude returns:
 *        - an interpreted summary of the query
 *        - structured filters it inferred (sender, date range, category)
 *        - a ranked list of email ids with a short match reason
 *   3. We re-order / filter the original `MockEmail` array to match.
 *
 * If Claude is unavailable, callers should fall back to plain keyword search.
 */

export interface AIEmailSearchResult {
  /** Plain-English summary of what the AI thinks the user is asking for */
  interpretation: string;
  /** Ordered list of email ids, best match first */
  rankedIds: string[];
  /** Per-email match reason keyed by email id (optional) */
  reasons: Record<string, string>;
  /** Inferred structured filters (informational) */
  filters: {
    sender?: string | null;
    senderRole?: 'lender' | 'client' | 'internal' | 'prospect' | null;
    dateRange?: string | null;
    dateRangeStart?: string | null;
    dateRangeEnd?: string | null;
    category?: string | null;
    topics?: string[];
    hasAttachments?: boolean | null;
  };
}

/** Keys of `filters` that the user can drop via a chip. */
export type AIEmailFilterKey =
  | 'sender'
  | 'senderRole'
  | 'dateRange'
  | 'category'
  | 'hasAttachments'
  | `topic:${string}`;

interface CandidateEmail {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  received_at: string;
  folder: string;
  is_read: boolean;
  needs_response: boolean;
  labels: string[];
  category?: string;
  deal_name?: string;
  has_attachments: boolean;
  attachment_names?: string[];
}

// Keep the prompt cheap — cap how many candidates we send to Claude per call.
const MAX_CANDIDATES = 200;
// Minimum query length before we even try AI search; below this, keyword is fine.
export const AI_SEARCH_MIN_LENGTH = 8;

function toCandidate(e: MockEmail): CandidateEmail {
  return {
    id: e.id,
    from: `${e.from_name || ''} <${e.from_email || ''}>`.trim(),
    subject: e.subject || '',
    snippet: (e.snippet || e.body_preview || '').slice(0, 240),
    received_at: e.received_at,
    folder: e.folder,
    is_read: e.is_read,
    needs_response: e.needs_response,
    labels: Array.isArray(e.labels) ? e.labels : [],
    category: (e as any).category,
    deal_name: (e as any).deal_name,
    has_attachments: !!e.has_attachments,
    attachment_names: Array.isArray((e as any).attachments)
      ? (e as any).attachments
          .map((a: any) => a?.filename || a?.name)
          .filter(Boolean)
          .slice(0, 5)
      : [],
  };
}

function buildSystemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `You are an email search assistant. Today is ${today}. Given a user's natural-language search query and a JSON list of candidate emails, you must:

1. Infer the user's intent (sender, time range, category, topics, action state).
2. Return ALL emails that genuinely match the intent — favor recall over precision. Semantic matches are allowed.
3. Rank by relevance first, then recency.
4. For each result, give a SHORT (max ~8 words) reason.

TERM MAPPING — apply these expansions when interpreting the query:

- "signed" / "executed" / "countersigned" / "fully signed" →
    match if ANY of: \`labels\` contains "Signed" (case-insensitive), \`subject\` or \`snippet\` mentions signed/executed/countersigned/DocuSign/HelloSign,
    OR any \`attachment_names\` entry matches /signed|executed|countersigned|_fully|-fully|fully[_-]signed/i.
- "NDA" / "non-disclosure" → \`subject\`/\`snippet\`/\`attachment_names\` mentions NDA, non-disclosure, mutual NDA, MNDA, confidentiality.
- "lender" / "lenders" / "from lenders" → sender is a lender. Match if ANY of:
    \`category\` is "lender", \`labels\` contains "Lender", or the sender's name/domain looks like a lending institution
    (bank, capital, credit, finance, fund, lending, partners, mezzanine, ventures-debt). Do NOT require the literal token "lender" in the email.
- "client" / "clients" → \`category\` is "deal" or "prospect", or \`deal_name\` is set.
- "last week" → received_at within the last 7 days from today (inclusive).
  "this week" → received_at since the start of the current ISO week.
  "last month" / "this month" / "today" / "yesterday" → analogous calendar windows.
  "recent" / "lately" → last 14 days.
- "needs response" / "to reply to" / "waiting on me" → \`needs_response\` is true.
- "with attachments" / "files" / "documents" → \`has_attachments\` is true.
- "from <name>" / "by <name>" → fuzzy match on sender name, email local-part, or sender domain.

Combine constraints with AND. If the query says "signed NDAs from lenders in the last week", a result must satisfy ALL of:
(signed) AND (NDA) AND (lender sender) AND (last 7 days). Do not drop a constraint silently — instead return fewer results.

Respond ONLY with a single JSON object inside a \`\`\`json code block. Schema:

{
  "interpretation": "Plain-English summary of what you searched for",
  "filters": {
    "sender": "string or null",
    "senderRole": "lender | client | internal | prospect | null",
    "dateRange": "today | yesterday | this_week | last_week | this_month | last_month | last_2_days | last_7_days | last_14_days | last_30_days | all",
    "dateRangeStart": "YYYY-MM-DD or null",
    "dateRangeEnd": "YYYY-MM-DD or null",
    "category": "calendar | asana_projects | clients_deals | invoices | scheduling | needs_response | null",
    "topics": ["short topic tags, e.g. 'NDA', 'signed', 'term sheet'"],
    "hasAttachments": true | false | null
  },
  "results": [
    { "id": "<email_id>", "reason": "short reason" }
  ]
}

Rules:
- Return at most 50 results.
- If nothing matches, return an empty results array (do not invent matches).
- Use the email ids exactly as provided.
- Do not include any prose outside the JSON code block.`;
}

function extractJsonBlock(text: string): any | null {
  if (!text) return null;
  // Look for ```json ... ``` first
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  try {
    return JSON.parse(raw.trim());
  } catch {
    // Try to grab the first top-level { ... } block as a fallback
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function useAIEmailSearch() {
  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState<AIEmailSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bump on every new search so stale responses can be discarded.
  const requestIdRef = useRef(0);
  // 60s in-memory cache, keyed by query + candidate-fingerprint.
  const cacheRef = useRef<Map<string, { at: number; value: AIEmailSearchResult }>>(new Map());
  const CACHE_TTL_MS = 60_000;

  const buildCacheKey = (q: string, candidates: MockEmail[]) => {
    // Cheap fingerprint: count + newest id + newest received_at. Good enough
    // to invalidate when the inbox actually changes.
    const newest = candidates[0];
    return `${q.toLowerCase()}|${candidates.length}|${newest?.id || ''}|${newest?.received_at || ''}`;
  };

  const search = useCallback(
    async (query: string, candidates: MockEmail[]): Promise<AIEmailSearchResult | null> => {
      const trimmed = query.trim();
      if (!trimmed || candidates.length === 0) {
        setResult(null);
        setError(null);
        return null;
      }

      const requestId = ++requestIdRef.current;
      setIsSearching(true);
      setError(null);

      // Cache hit short-circuits the network call.
      const cacheKey = buildCacheKey(trimmed, candidates);
      const cached = cacheRef.current.get(cacheKey);
      if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        if (requestId === requestIdRef.current) {
          setResult(cached.value);
          setIsSearching(false);
        }
        return cached.value;
      }

      try {
        // Sort candidates newest-first and cap to keep the prompt small.
        const limited = [...candidates]
          .sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime())
          .slice(0, MAX_CANDIDATES)
          .map(toCandidate);

        // Server-side AI search: prompt + logging live in the edge function.
        const { data: response, error: invokeError } = await supabase.functions.invoke(
          'email-ai-search',
          { body: { query: trimmed, candidates: limited } },
        );

        // Discard if a newer request started.
        if (requestId !== requestIdRef.current) return null;

        if (invokeError) {
          throw new Error(invokeError.message || 'AI search failed');
        }
        if (!response || !Array.isArray(response.results)) {
          throw new Error('AI returned an invalid response');
        }

        const validIds = new Set(candidates.map(c => c.id));
        const rankedIds: string[] = [];
        const reasons: Record<string, string> = {};
        for (const r of response.results) {
          if (r && typeof r.id === 'string' && validIds.has(r.id)) {
            rankedIds.push(r.id);
            if (typeof r.reason === 'string') reasons[r.id] = r.reason;
          }
        }

        const filters = response.parsedFilters ?? {};
        const next: AIEmailSearchResult = {
          interpretation:
            (typeof response.interpretation === 'string' && response.interpretation.trim()) ||
            `Showing results for "${trimmed}"`,
          rankedIds,
          reasons,
          filters: {
            sender: filters.sender ?? null,
            senderRole: filters.senderRole ?? null,
            dateRange: filters.dateRange ?? null,
            dateRangeStart: filters.dateRangeStart ?? null,
            dateRangeEnd: filters.dateRangeEnd ?? null,
            category: filters.category ?? null,
            topics: Array.isArray(filters.topics) ? filters.topics : [],
            hasAttachments:
              typeof filters.hasAttachments === 'boolean'
                ? filters.hasAttachments
                : null,
          },
        };

        // Debug log so we can audit recall during manual QA.
        // eslint-disable-next-line no-console
        console.debug('[ai-email-search]', {
          query: trimmed,
          parsedFilters: filters,
          interpretation: next.interpretation,
          candidateCount: limited.length,
          resultCount: rankedIds.length,
          latencyMs: response.latencyMs,
        });

        setResult(next);
        cacheRef.current.set(cacheKey, { at: Date.now(), value: next });
        return next;
      } catch (e) {
        if (requestId !== requestIdRef.current) return null;
        const msg = e instanceof Error ? e.message : 'AI search failed';
        setError(msg);
        setResult(null);
        return null;
      } finally {
        if (requestId === requestIdRef.current) {
          setIsSearching(false);
        }
      }
    },
    []
  );

  const clear = useCallback(() => {
    requestIdRef.current++;
    setResult(null);
    setError(null);
    setIsSearching(false);
  }, []);

  /** Cancel any in-flight request without clearing the existing result. */
  const cancel = useCallback(() => {
    requestIdRef.current++;
    setIsSearching(false);
  }, []);

  /**
   * Drop a single filter chip and update `result` in place. We do NOT re-run
   * the AI call — instead we just clear the corresponding filter so the parent
   * can relax its post-filter step. The `rankedIds` stay intact (they are the
   * AI's superset); the parent UI is responsible for re-applying the remaining
   * filters against `rankedIds` if it wants stricter constraints.
   */
  const removeFilter = useCallback((key: AIEmailFilterKey) => {
    setResult((prev) => {
      if (!prev) return prev;
      const f = { ...prev.filters };
      if (key === 'sender') f.sender = null;
      else if (key === 'senderRole') f.senderRole = null;
      else if (key === 'dateRange') {
        f.dateRange = null;
        f.dateRangeStart = null;
        f.dateRangeEnd = null;
      } else if (key === 'category') f.category = null;
      else if (key === 'hasAttachments') f.hasAttachments = null;
      else if (key.startsWith('topic:')) {
        const topic = key.slice('topic:'.length);
        f.topics = (f.topics || []).filter((t) => t !== topic);
      }
      return { ...prev, filters: f };
    });
  }, []);

  return { search, clear, cancel, removeFilter, result, isSearching, error };
}
