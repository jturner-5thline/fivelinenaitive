const FREE_EMAIL_PROVIDERS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'msn.com',
  'aol.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'mail.com',
  'protonmail.com',
  'proton.me',
  'gmx.com',
  'gmx.net',
  'yandex.com',
  'zoho.com',
]);

/** Returns lowercased domain after `@`, or null if missing/invalid/free provider. */
export function extractEmailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf('@');
  if (at < 0) return null;
  const domain = email.slice(at + 1).toLowerCase().trim();
  if (!domain || domain.includes(' ') || !domain.includes('.')) return null;
  if (FREE_EMAIL_PROVIDERS.has(domain)) return null;
  return domain;
}

export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  return input
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');
}

/** Pretty company name guess from domain: "upflex.com" -> "Upflex". */
export function companyNameFromDomain(domain: string): string {
  const root = domain.split('.')[0] || domain;
  return root.charAt(0).toUpperCase() + root.slice(1);
}