/**
 * Detects newsletter / marketing / content-platform senders so the AI
 * Assist sidebar does not classify them as a Lender / Funding Source.
 *
 * Used by useThreadWorkflowAnalysis to null out `likely_lender_firm` when
 * the sender domain is a known newsletter platform, when the email carries
 * a `List-Unsubscribe` / `List-Id` header (RFC 2369 / 5064), or when the
 * AI's own confidence in the lender match is low.
 *
 * Pure module — no React, no Supabase. Easy to unit test.
 */

export const NEWSLETTER_DENY_DOMAINS: ReadonlySet<string> = new Set([
  'substack.com',
  'mailchimp.com',
  'beehiiv.com',
  'convertkit.com',
  'ghost.io',
  'medium.com',
  'linkedin.com',
  'twitter.com',
  'x.com',
  'reddit.com',
  'youtube.com',
  'googlegroups.com',
  'mailgun.org',
  'sendgrid.net',
]);

function extractDomain(email?: string | null): string {
  if (!email) return '';
  const at = email.indexOf('@');
  if (at < 0) return '';
  return email.slice(at + 1).trim().toLowerCase().replace(/^www\./, '');
}

/**
 * True when the sender domain (or any of its parent domains) is in the
 * newsletter deny-list. Handles subdomains like `email.substack.com`.
 */
export function isNewsletterSender(fromEmail?: string | null): boolean {
  const domain = extractDomain(fromEmail);
  if (!domain) return false;
  if (NEWSLETTER_DENY_DOMAINS.has(domain)) return true;
  // Walk up parent domains: email.substack.com -> substack.com
  const parts = domain.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const parent = parts.slice(i).join('.');
    if (NEWSLETTER_DENY_DOMAINS.has(parent)) return true;
  }
  return false;
}

export type HeaderMap = Record<string, string | string[] | undefined> | null | undefined;

/**
 * True when the message carries a `List-Unsubscribe` or `List-Id` header,
 * which is the canonical signal that the sender is a mailing-list / bulk
 * platform rather than a 1:1 lender contact.
 */
export function hasListUnsubscribe(headers: HeaderMap): boolean {
  if (!headers) return false;
  for (const key of Object.keys(headers)) {
    const k = key.toLowerCase();
    if (k === 'list-unsubscribe' || k === 'list-id') {
      const v = headers[key];
      if (Array.isArray(v) ? v.length > 0 : !!v) return true;
    }
  }
  return false;
}
