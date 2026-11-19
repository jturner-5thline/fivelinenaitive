export const PATH_TYPES = ['introduced_by', 'referred_by', 'former_colleague', 'mutual_connection', 'met_at_event', 'other'] as const;
export const EVIDENCE_TYPES = ['intro_email', 'calendar', 'linkedin', 'referral_source', 'manual'] as const;

export const labelize = (v?: string | null) => (v ? v.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '—');

/** Link for an intro path's evidence: URLs as-is, Gmail message ids to Gmail. */
export function introEvidenceUrl(type?: string | null, ref?: string | null): string | null {
  if (!ref) return null;
  if (/^https?:\/\//i.test(ref)) return ref;
  if (type === 'intro_email' && /^[0-9a-f]{10,}$/i.test(ref)) return `https://mail.google.com/mail/u/0/#all/${ref}`;
  return null;
}
