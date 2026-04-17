import { useCallback, useRef, useState } from 'react';
import { sendClaudeMessage } from '@/services/claude';
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
    dateRange?: string | null;
    category?: string | null;
    topics?: string[];
  };
}

interface CandidateEmail {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  received_at: string;
  folder: string;
  is_read: boolean;
  needs_response: boolean;
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
  };
}

function buildSystemPrompt(): string {
  return `You are an email search assistant. Given a user's natural-language search query and a JSON list of candidate emails, you must:

1. Infer the user's intent (sender, time range, category like "calendar" or "asana_projects" or "clients_deals", topics, action state like "needs response").
2. Return ONLY emails that genuinely match the intent — semantic matches are allowed, but do not return obviously unrelated mail.
3. Rank by relevance first, then recency.
4. For each result, give a SHORT (max ~8 words) reason such as "sender match", "topic: invoices", "calendar invite", "semantically related to lender outreach".

Respond ONLY with a single JSON object inside a \`\`\`json code block. Schema:

{
  "interpretation": "Showing emails from <X> about <Y> from <when>",
  "filters": {
    "sender": "string or null",
    "dateRange": "today | yesterday | this_week | last_week | this_month | last_month | last_2_days | last_7_days | all",
    "category": "calendar | asana_projects | clients_deals | invoices | scheduling | needs_response | null",
    "topics": ["short topic tags"]
  },
  "results": [
    { "id": "<email_id>", "reason": "short reason" }
  ]
}

Rules:
- Return at most 50 results.
- If nothing reasonably matches, return an empty results array (do not invent matches).
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

      try {
        // Sort candidates newest-first and cap to keep the prompt small.
        const limited = [...candidates]
          .sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime())
          .slice(0, MAX_CANDIDATES)
          .map(toCandidate);

        const userContent =
          `Query: ${trimmed}\n\nCandidate emails (JSON):\n` + JSON.stringify(limited);

        const response = await sendClaudeMessage(
          {
            messages: [{ role: 'user', content: userContent }],
            system: buildSystemPrompt(),
            temperature: 0.2,
            max_tokens: 2000,
            context: 'agent',
          },
          { retries: 1, timeoutMs: 30_000 }
        );

        // Discard if a newer request started.
        if (requestId !== requestIdRef.current) return null;

        if (!response.success) {
          throw new Error(response.error || 'AI search failed');
        }

        const parsed = extractJsonBlock(response.response);
        if (!parsed || !Array.isArray(parsed.results)) {
          throw new Error('AI returned an invalid response');
        }

        const validIds = new Set(candidates.map(c => c.id));
        const rankedIds: string[] = [];
        const reasons: Record<string, string> = {};
        for (const r of parsed.results) {
          if (r && typeof r.id === 'string' && validIds.has(r.id)) {
            rankedIds.push(r.id);
            if (typeof r.reason === 'string') reasons[r.id] = r.reason;
          }
        }

        const next: AIEmailSearchResult = {
          interpretation:
            (typeof parsed.interpretation === 'string' && parsed.interpretation.trim()) ||
            `Showing results for "${trimmed}"`,
          rankedIds,
          reasons,
          filters: {
            sender: parsed.filters?.sender ?? null,
            dateRange: parsed.filters?.dateRange ?? null,
            category: parsed.filters?.category ?? null,
            topics: Array.isArray(parsed.filters?.topics) ? parsed.filters.topics : [],
          },
        };

        setResult(next);
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

  return { search, clear, result, isSearching, error };
}
