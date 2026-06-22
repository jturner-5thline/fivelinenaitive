/**
 * Client-side mirror of the SQL domain normalization helpers
 * (`normalize_email_domain`, `normalize_website_domain`, `is_freemail_domain`).
 * Keep this in sync with the SQL functions in the contact-company-sync migration.
 */

export const FREEMAIL_DOMAINS = new Set<string>([
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'rocketmail.com',
  'hotmail.com', 'outlook.com', 'live.com', 'msn.com', 'aol.com',
  'icloud.com', 'me.com', 'mac.com',
  'protonmail.com', 'proton.me', 'hey.com', 'fastmail.com',
  'gmx.com', 'gmx.net', 'mail.com', 'yandex.com', 'zoho.com',
  'comcast.net', 'verizon.net', 'att.net', 'sbcglobal.net',
])

export function normalizeEmailDomain(email: string | null | undefined): string | null {
  if (!email) return null
  const trimmed = email.trim().toLowerCase()
  const at = trimmed.indexOf('@')
  if (at < 0) return null
  const d = trimmed.slice(at + 1).trim()
  if (!d || !d.includes('.') || d.includes(' ')) return null
  return d
}

export function normalizeWebsiteDomain(url: string | null | undefined): string | null {
  if (!url) return null
  let d = url.trim().toLowerCase()
  if (!d) return null
  d = d.replace(/^https?:\/\//, '').replace(/^www\./, '')
  d = d.split('/')[0].split('?')[0].split('#')[0].trim()
  d = d.replace(/\.+$/, '')
  if (!d || !d.includes('.')) return null
  return d
}

export function isFreemailDomain(domain: string | null | undefined): boolean {
  if (!domain) return false
  return FREEMAIL_DOMAINS.has(domain.toLowerCase())
}

/** Return the registrable root (last two labels). Best-effort, ignores public-suffix list. */
export function extractRootDomain(domain: string | null | undefined): string | null {
  if (!domain) return null
  const parts = domain.toLowerCase().split('.').filter(Boolean)
  if (parts.length < 2) return null
  return parts.slice(-2).join('.')
}