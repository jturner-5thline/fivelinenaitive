/**
 * Detection: bare email addresses in a reply draft body.
 *
 * A "bare" email is one that appears on its own line (or surrounded only by
 * whitespace/punctuation) — i.e. the user is explicitly capturing a contact,
 * not writing prose like "send it to jamaal@solofunds.com tomorrow".
 */

const BARE_EMAIL_LINE = /^\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\s*[,;]?\s*$/i;
const ANY_EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export interface DetectedDraftEmail {
  email: string;
  domain: string;
  /** Best-effort contact name (token before @, prettified). */
  inferredName: string;
  /** One-line snippet of context (the line before, if any). */
  contextSnippet: string;
}

export function detectBareEmailsInDraft(body: string): DetectedDraftEmail[] {
  if (!body) return [];
  const lines = body.split(/\r?\n/);
  const results: DetectedDraftEmail[] = [];
  const seen = new Set<string>();

  lines.forEach((rawLine, idx) => {
    const m = rawLine.match(BARE_EMAIL_LINE);
    if (!m) return;
    const email = m[1].trim().toLowerCase();
    if (seen.has(email)) return;
    seen.add(email);

    const localPart = email.split('@')[0] || '';
    const domain = email.split('@')[1] || '';
    const inferredName = localPart
      .replace(/[._-]+/g, ' ')
      .trim()
      .replace(/\b\w/g, c => c.toUpperCase());

    // Context = previous non-empty line, trimmed, max 140 chars.
    let contextSnippet = '';
    for (let i = idx - 1; i >= 0; i--) {
      const prev = lines[i].trim();
      if (prev) {
        contextSnippet = prev.slice(0, 140);
        break;
      }
    }

    results.push({ email, domain, inferredName, contextSnippet });
  });

  return results;
}

/** Strip common subject decorations and extract a candidate company token. */
export function extractCompanyFromSubject(subject: string): string {
  if (!subject) return '';
  const cleaned = subject.replace(/^(re:|fwd?:)\s*/i, '').trim();
  // Split on common separators: & | - ( :
  const token = cleaned.split(/[&|()\-:–—]/)[0].trim();
  return token;
}

export function extractDomain(email: string): string {
  return (email.split('@')[1] || '').toLowerCase();
}

/** Crude domain → registrable-domain (drop common subdomains). */
export function normalizeDomain(domain: string): string {
  if (!domain) return '';
  const lower = domain.toLowerCase().trim();
  // Drop www. prefix
  return lower.replace(/^www\./, '');
}

/** Quick fuzzy: token-overlap ratio in [0,1]. */
export function fuzzyNameScore(a: string, b: string): number {
  if (!a || !b) return 0;
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t && !['the', 'and', 'inc', 'llc', 'co', 'corp', 'ltd'].includes(t));
  const ta = new Set(norm(a));
  const tb = new Set(norm(b));
  if (!ta.size || !tb.size) return 0;
  let overlap = 0;
  ta.forEach(t => { if (tb.has(t)) overlap += 1; });
  return overlap / Math.max(ta.size, tb.size);
}