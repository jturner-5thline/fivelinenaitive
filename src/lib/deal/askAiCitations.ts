/**
 * Source citation helpers for the Ask AI transcript export.
 *
 * `sources` returned by the deal-space-ai function are free-form strings: a
 * document name, a stored document id, a URL, or "Name (id)". These helpers
 * normalize them into verifiable citations with a resolvable URL so a teammate
 * reading the exported report can open the underlying record.
 */

export interface Citation {
  /** 1-based index used for the [^n] footnote markers. */
  index: number;
  /** Human-readable label. */
  label: string;
  /** Resolvable URL, when one can be derived. */
  url?: string;
  /** Raw source string as returned by the AI. */
  raw: string;
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const origin = () => (typeof window !== 'undefined' ? window.location.origin : '');

/** Parses one raw source string into a label + best-effort URL. */
export function parseSource(raw: string, dealId?: string): Omit<Citation, 'index'> {
  const value = raw.trim();

  // Already a URL.
  if (/^https?:\/\//i.test(value)) {
    return { label: value.replace(/^https?:\/\//i, ''), url: value, raw };
  }

  // "Document name (uuid)" or a bare uuid → deep link into the deal documents tab.
  const idMatch = value.match(UUID_RE);
  if (idMatch && dealId) {
    const label = value.replace(/[（(]\s*[0-9a-f-]{36}\s*[)）]/i, '').trim() || 'Document';
    return {
      label,
      url: `${origin()}/deals/${dealId}?tab=documents&doc=${idMatch[0]}`,
      raw,
    };
  }

  // Named document with no id → link to the deal's documents tab with a search.
  if (dealId) {
    return {
      label: value,
      url: `${origin()}/deals/${dealId}?tab=documents&q=${encodeURIComponent(value)}`,
      raw,
    };
  }

  return { label: value, raw };
}

/**
 * Builds a deduped, numbered citation list across every message in a transcript.
 * The returned map keys are the raw source strings, so a message can look up the
 * footnote number it should print.
 */
export function buildCitationIndex(
  messages: Array<{ sources?: string[] }>,
  dealId?: string,
): { citations: Citation[]; indexByRaw: Map<string, number> } {
  const citations: Citation[] = [];
  const indexByRaw = new Map<string, number>();

  for (const m of messages) {
    for (const raw of m.sources ?? []) {
      const key = raw.trim();
      if (!key || indexByRaw.has(key)) continue;
      const parsed = parseSource(key, dealId);
      const index = citations.length + 1;
      citations.push({ index, ...parsed });
      indexByRaw.set(key, index);
    }
  }

  return { citations, indexByRaw };
}

/** Renders the appendix section listing every citation with its URL. */
export function renderCitationAppendix(citations: Citation[]): string[] {
  if (!citations.length) return [];
  const lines = ['---', '', '## Sources & citations', ''];
  for (const c of citations) {
    lines.push(
      c.url
        ? `${c.index}. **${c.label}** — ${c.url}`
        : `${c.index}. **${c.label}** _(no direct link available)_`,
    );
  }
  lines.push('');
  lines.push(
    '_Links open the referenced record in nAItive; sign-in is required to view deal data._',
  );
  lines.push('');
  return lines;
}
