/**
 * Normalize a variety of LinkedIn inputs into a canonical profile URL.
 * Accepts: full URLs, "linkedin.com/in/handle", "in/handle", "@handle", or bare handles.
 * Returns null for empty input; returns the trimmed input as-is if it can't be normalized.
 */
export function normalizeLinkedInUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = String(input).trim();
  if (!s) return null;

  // Strip surrounding quotes/whitespace
  s = s.replace(/^["'\s]+|["'\s]+$/g, '');

  // Already a full URL
  const urlMatch = s.match(/^https?:\/\/([^\s]+)$/i);
  if (urlMatch) {
    try {
      const u = new URL(s);
      if (/(^|\.)linkedin\.com$/i.test(u.hostname)) {
        // Force https + www + strip trailing slash & query/hash noise for /in/ paths
        const path = u.pathname.replace(/\/+$/, '');
        return `https://www.linkedin.com${path}`;
      }
      return s;
    } catch {
      // fall through
    }
  }

  // Strip leading protocol-less "www." or "linkedin.com"
  s = s.replace(/^@+/, '');
  const lower = s.toLowerCase();

  if (lower.startsWith('linkedin.com/') || lower.startsWith('www.linkedin.com/')) {
    const path = s.substring(s.indexOf('/')).replace(/\/+$/, '');
    return `https://www.linkedin.com${path}`;
  }

  // "in/handle", "pub/handle", "company/handle"
  const pathMatch = s.match(/^(in|pub|company|school)\/([^\/\s?#]+)/i);
  if (pathMatch) {
    return `https://www.linkedin.com/${pathMatch[1].toLowerCase()}/${pathMatch[2]}`;
  }

  // Bare handle -> assume /in/
  if (/^[a-zA-Z0-9\-_.%]+$/.test(s)) {
    return `https://www.linkedin.com/in/${s}`;
  }

  return s;
}