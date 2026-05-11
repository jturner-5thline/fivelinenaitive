/**
 * Pure helpers shared by the "Create Task from Email" flow and the task
 * description renderer. Extracted so they can be unit-tested without
 * mounting React components.
 */

/**
 * Strip raw HTML tags and decode the most common HTML entities from an
 * email snippet so the prefilled task notes show clean prose instead of
 * escaped markup.
 */
export function cleanEmailSnippet(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Matches bare http(s) URLs in plain text. Stops at whitespace and the
 * common trailing punctuation that almost always belongs to surrounding
 * prose rather than the URL itself.
 */
export const URL_REGEX = /\bhttps?:\/\/[^\s<>"')]+/g;

export type LinkifyPart = { type: 'text'; value: string } | { type: 'url'; value: string };

/**
 * Split a plain-text string into alternating text/url segments using
 * URL_REGEX. The renderer wraps `url` parts in <a> tags; the splitter is
 * kept pure so it can be tested in isolation.
 */
export function splitTextByUrls(text: string): LinkifyPart[] {
  if (!text) return [];
  const parts: LinkifyPart[] = [];
  let lastIdx = 0;
  for (const match of text.matchAll(URL_REGEX)) {
    const start = match.index ?? 0;
    if (start > lastIdx) parts.push({ type: 'text', value: text.slice(lastIdx, start) });
    parts.push({ type: 'url', value: match[0] });
    lastIdx = start + match[0].length;
  }
  if (lastIdx < text.length) parts.push({ type: 'text', value: text.slice(lastIdx) });
  return parts;
}