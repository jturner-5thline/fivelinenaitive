/**
 * Helpers for working with email signatures that may be either plain-text
 * (legacy) or rich HTML (new RTE-authored).
 *
 * The composer body, the AI draft pipeline, and the Settings preview all share
 * one source of truth so a signature renders identically wherever it appears.
 */

import DOMPurify from 'dompurify';

/** Heuristic: treat the value as HTML if it contains any tag-like markup. */
export function isHtmlSignature(value: string | null | undefined): boolean {
  if (!value) return false;
  return /<\/?[a-z][\s\S]*?>/i.test(value);
}

/**
 * Convert a signature into safe HTML suitable for embedding in the composer
 * body or rendering in a preview. Plain-text values are escaped and wrapped
 * in <p>/<br> so newlines survive.
 */
export function signatureToHtml(value: string | null | undefined): string {
  if (!value) return '';
  if (isHtmlSignature(value)) return sanitizeSignatureHtml(value);
  return plainTextToHtml(value);
}

/** Strip all tags and collapse whitespace. Used for the indicator pill etc. */
export function signatureToPlainText(value: string | null | undefined): string {
  if (!value) return '';
  if (!isHtmlSignature(value)) return value;
  if (typeof window === 'undefined') {
    // Best-effort fallback for SSR/edge: drop tags textually.
    return value
      .replace(/<br\s*\/?>(?!\n)/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .trim();
  }
  const tmp = document.createElement('div');
  tmp.innerHTML = sanitizeSignatureHtml(value);
  return (tmp.textContent || tmp.innerText || '').trim();
}

/** Get the first non-empty visible line of a signature for a compact preview. */
export function signatureFirstLine(value: string | null | undefined): string {
  const text = signatureToPlainText(value);
  if (!text) return '';
  return text.split(/\r?\n/).find((l) => l.trim()) || '';
}

/**
 * DOMPurify allowlist tuned for email signatures. Strips <script>, on*
 * handlers, javascript:/data: URLs, and anything not in the inline-content
 * vocabulary common across email clients.
 */
export function sanitizeSignatureHtml(html: string): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'ul', 'ol', 'li',
      'img', 'hr', 'span', 'div', 'small', 'blockquote',
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel', 'src', 'alt', 'title', 'width', 'height',
      'style', 'class',
    ],
    // Force safe link defaults; DOMPurify rejects javascript:/data: by default.
    ADD_ATTR: ['target', 'rel'],
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
  });
}

function plainTextToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  // Each line becomes its own <p>; empty lines become a <p><br/></p> spacer.
  return escaped
    .split(/\r?\n/)
    .map((line) => (line.length === 0 ? '<p><br/></p>' : `<p>${line}</p>`))
    .join('');
}

/**
 * Returns true when `body` already contains the full signature (or its first
 * visible line) so callers can avoid duplicating it. Works on both HTML and
 * plain-text bodies/signatures.
 */
export function bodyContainsSignature(
  body: string | null | undefined,
  signature: string | null | undefined,
): boolean {
  if (!signature || !body) return false;
  const sigText = signatureToPlainText(signature).trim();
  const bodyText = signatureToPlainText(body).trim();
  if (!sigText || !bodyText) return false;
  const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase();
  const nb = norm(bodyText);
  const ns = norm(sigText);
  if (nb.includes(ns)) return true;
  const firstLine = sigText.split(/\r?\n/).find((l) => l.trim());
  if (firstLine && firstLine.length >= 3) {
    const tail = nb.slice(Math.max(0, nb.length - 160));
    if (tail.includes(norm(firstLine))) return true;
  }
  return false;
}