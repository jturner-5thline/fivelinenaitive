/**
 * Personal email domains that are not allowed for signup or login.
 * Only corporate/business email addresses are permitted.
 */
export const BLOCKED_EMAIL_DOMAINS = [
  'gmail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'ymail.com',
  'rocketmail.com',
  'aol.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'proton.me',
  'protonmail.com',
  'tutanota.com',
  'tutamail.com',
  'tuta.io',
  'gmx.com',
  'gmx.us',
  'gmx.de',
  'web.de',
  'laposte.net',
  'mail.com',
  'yandex.com',
  'yandex.ru',
  'seznam.cz',
  '163.com',
  '126.com',
  'qq.com',
  'lycos.com',
  'inbox.com',
  'zoho.com',
  'zohomail.com',
];

/**
 * Specific email addresses that are whitelisted despite using a blocked domain.
 */
const WHITELISTED_EMAILS = [
  'goturner@outlook.com',
];

/**
 * Check if an email uses a blocked personal domain.
 * Returns true if the domain is blocked (unless the exact email is whitelisted).
 */
export function isBlockedEmailDomain(email: string): boolean {
  const normalizedEmail = email.trim().toLowerCase();
  if (WHITELISTED_EMAILS.includes(normalizedEmail)) return false;
  const domain = normalizedEmail.split('@')[1];
  if (!domain) return false;
  return BLOCKED_EMAIL_DOMAINS.includes(domain);
}

export const BLOCKED_DOMAIN_ERROR = 'Personal email addresses are not allowed. Please use your work email.';
