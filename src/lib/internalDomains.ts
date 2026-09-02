/**
 * Internal/advisor email domains. Senders on these domains are part of the
 * 5th Line / naitive team — never surface them as "New contact" suggestions
 * or as deal contacts to add. Mirrors the advisory-domain list used by the
 * weighted-evidence deal matcher.
 */
export const INTERNAL_DOMAINS = new Set<string>([
  '5thline.co',
  'naitive.co',
  '5l.co',
]);

export function domainOf(email?: string | null): string {
  if (!email) return '';
  const at = email.indexOf('@');
  if (at < 0) return '';
  return email.slice(at + 1).trim().toLowerCase().replace(/^www\./, '');
}

export function isInternalEmail(email?: string | null): boolean {
  const d = domainOf(email);
  return !!d && INTERNAL_DOMAINS.has(d);
}
