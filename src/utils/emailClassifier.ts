/**
 * Shared email classification logic used by both Daily Briefing and Email pop-up.
 * Single source of truth for category rules.
 *
 * "Clients & Deals" uses a confidence-scored approach: domain matches are strong,
 * exact name matches are moderate, and fuzzy/token matches are weak (require
 * a second signal). Marketing / platform noise is explicitly excluded.
 */

import type { ClassifierEntity } from '@/hooks/useEmailClassifierData';

export type EmailCategory = 'clients_deals' | 'asana_projects' | 'calendar';

export const EMAIL_CATEGORY_TABS = [
  { key: 'all' as const, label: 'All' },
  { key: 'clients_deals' as const, label: 'Deals' },
  { key: 'asana_projects' as const, label: 'Asana' },
  { key: 'calendar' as const, label: 'Calendar' },
] as const;

/**
 * Optional context about the user's own organisation so we can exclude
 * self-referencing matches (e.g. "5th Line Capital" appearing in a subject).
 */
export interface ClassifierOrgContext {
  /** The org's own company name (lowercase) */
  orgName?: string;
  /** The org's own domains (e.g. ['5thline.co']) */
  orgDomains?: string[];
}

export type EmailCategoryTab = 'all' | EmailCategory;

// ── Exclusion lists ────────────────────────────────────────────

const EXCLUDED_SENDER_DOMAINS = new Set([
  'linkedin.com',
  'e.linkedin.com',
  'linkedin-ei.com',
  'facebookmail.com',
  'twitter.com',
  'x.com',
  'mail.instagram.com',
  'redditmail.com',
  'quora.com',
  'medium.com',
  'substack.com',
  'mailchimp.com',
  'sendgrid.net',
  'sendgrid.com',
  'constantcontact.com',
  'hubspot.com',
  'hs-analytics.net',
  'hubspotlinks.com',
  'mailgun.org',
  'mailgun.com',
  'amazonses.com',
  'sendinblue.com',
  'brevo.com',
  'klaviyo.com',
  'marketo.com',
  'pardot.com',
  'salesforce.com',
  'intercom.io',
  'intercom-mail.com',
  'drift.com',
  'crisp.chat',
  'zendesk.com',
  'freshdesk.com',
  'notion.so',
  'slack.com',
  'slackbot.com',
  'trello.com',
  'atlassian.com',
  'jira.com',
  'confluence.com',
  'monday.com',
  'docusign.net',
  'docusign.com',
  'pandadoc.com',
  'calendly.com',
  'zoom.us',
  'zoom.com',
  'meetingbird.com',
  'eventbrite.com',
  'loom.com',
  'figma.com',
  'canva.com',
  'grammarly.com',
  'dropbox.com',
  'box.com',
  'wetransfer.com',
  'noreply.github.com',
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'vercel.com',
  'netlify.com',
  'heroku.com',
  'aws.amazon.com',
  'google.com',
  'googleusercontent.com',
  'youtube.com',
  'apple.com',
  'microsoft.com',
  'live.com',
  'outlook.com',
  'office365.com',
  'intuit.com',
  'quickbooks.com',
  'xero.com',
  'stripe.com',
  'paypal.com',
  'squarespace.com',
  'wix.com',
  'shopify.com',
  'godaddy.com',
  'namecheap.com',
  'sentry.io',
  'datadog.com',
  'newrelic.com',
  'postmarkapp.com',
  'convertkit.com',
  'activecampaign.com',
  'drip.com',
  'getresponse.com',
  'beehiiv.com',
  'ghost.io',
  'buttondown.email',
  'revue.email',
  'producthunt.com',
  'ycombinator.com',
  'crunchbase.com',
  'pitchbook.com',
  'cbinsights.com',
  'techcrunch.com',
  'theinformation.com',
  'bloomberg.com',
  'wsj.com',
  'ft.com',
  'reuters.com',
]);

/** Patterns in from-address local part that indicate automated / bulk mail */
const NOREPLY_PATTERNS = [
  'noreply', 'no-reply', 'donotreply', 'do-not-reply',
  'mailer-daemon', 'postmaster', 'notifications', 'notification',
  'digest', 'newsletter', 'news', 'updates', 'update',
  'marketing', 'campaign', 'promo', 'promotions',
  'announce', 'announcements', 'info@', 'hello@',
  'support@', 'help@', 'feedback@', 'team@',
  'community@', 'events@', 'webinar',
];

/** Subject-line patterns strongly indicating marketing / bulk */
const MARKETING_SUBJECT_PATTERNS = [
  /\bunsubscribe\b/i,
  /\bnewsletter\b/i,
  /\bdigest\b/i,
  /\bweekly\s+(?:update|roundup|recap|wrap)/i,
  /\bmonthly\s+(?:update|roundup|recap|wrap)/i,
  /\bdaily\s+(?:update|roundup|recap|wrap)/i,
  /\bwebinar\b/i,
  /\bfree\s+trial\b/i,
  /\blimited\s+time\b/i,
  /\bspecial\s+offer\b/i,
  /\b(?:join|register)\s+(?:now|today|us)\b/i,
  /\byou(?:'re|r)\s+invited\b/i,
  /\bdon'?t\s+miss\b/i,
];

// ── Helpers ────────────────────────────────────────────────────

function domainFromEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 0) return '';
  return email.slice(at + 1).toLowerCase().trim();
}

function norm(s: string | undefined | null): string {
  return (s || '').toLowerCase();
}

function containsName(text: string, nameTokens: string[]): boolean {
  if (nameTokens.length === 0) return false;
  if (nameTokens.length === 1 && nameTokens[0].length <= 3) return false;
  return nameTokens.every(t => text.includes(t));
}

function buildSearchText(email: Record<string, any>): string {
  const parts: string[] = [
    norm(email.subject),
    norm(email.snippet),
    norm(email.body_preview),
    norm(email.body_text),
    norm(email.from_name),
    norm(email.from_email),
    norm(email.to_name),
    norm(email.to_email),
  ];
  const arrayFields = ['to_emails', 'cc_emails', 'bcc_emails', 'to_names', 'cc_names'];
  for (const field of arrayFields) {
    const arr = email[field];
    if (Array.isArray(arr)) parts.push(...arr.map((v: string) => norm(v)));
  }
  return parts.join(' ');
}

function collectDomains(email: Record<string, any>): Set<string> {
  const domains = new Set<string>();
  const addDomain = (addr: string) => {
    const d = domainFromEmail(addr);
    if (d) domains.add(d);
  };
  addDomain(email.from_email || '');
  addDomain(email.to_email || '');
  for (const field of ['to_emails', 'cc_emails', 'bcc_emails']) {
    const arr = email[field];
    if (Array.isArray(arr)) arr.forEach((a: string) => addDomain(a));
  }
  return domains;
}

// ── Noise detection ────────────────────────────────────────────

function isMarketingOrPlatformNoise(email: Record<string, any>): boolean {
  const fromEmail = norm(email.from_email);
  const fromDomain = domainFromEmail(fromEmail);
  const subject = norm(email.subject);

  // 1. Excluded sender domain
  if (EXCLUDED_SENDER_DOMAINS.has(fromDomain)) return true;
  // Also check parent domain (e.g. e.linkedin.com → linkedin.com)
  const domParts = fromDomain.split('.');
  if (domParts.length > 2) {
    const parent = domParts.slice(-2).join('.');
    if (EXCLUDED_SENDER_DOMAINS.has(parent)) return true;
  }

  // 2. No-reply / automated local-part patterns
  const localPart = fromEmail.split('@')[0] || '';
  if (NOREPLY_PATTERNS.some(p => localPart.includes(p))) return true;

  // 3. Marketing subject patterns
  if (MARKETING_SUBJECT_PATTERNS.some(rx => rx.test(subject))) return true;

  // 4. List-Unsubscribe header (if available in the email object)
  if (email.list_unsubscribe || email.headers?.['list-unsubscribe'] || email.headers?.['List-Unsubscribe']) {
    return true;
  }

  // 5. LinkedIn-specific content patterns
  if (
    subject.includes('linkedin') ||
    fromEmail.includes('linkedin') ||
    norm(email.from_name).includes('linkedin') ||
    norm(email.snippet).includes('view on linkedin') ||
    norm(email.body_text).includes('view on linkedin') ||
    norm(email.snippet).includes('linkedin.com/') ||
    norm(email.body_text).includes('linkedin.com/')
  ) {
    return true;
  }

  return false;
}

// ── Confidence-scored classification ───────────────────────────

// An email qualifies for "Clients & Deals" ONLY via:
//   Path A: domain match (sender/recipient domain = entity domain)  → instant
//   Path B: legacy explicit deal-link flags                         → instant
//   Path C: exact entity name in subject (non-generic, non-self)    → qualifies
//   Path D: exact entity name in body + supplementary signal        → qualifies
// Fuzzy / token matches and body-only mentions are NEVER enough alone.

const SCORE_DOMAIN_MATCH = 10;      // Participant domain = entity domain → instant
const SCORE_LEGACY_SIGNAL = 10;     // Explicit deal linkage flags → instant
const SCORE_EXACT_NAME_SUBJECT = 8; // Exact entity name in subject → qualifies (generic names already filtered)
const SCORE_EXACT_NAME_BODY = 4;    // Exact entity name in body (needs one more signal)
const SCORE_DOMAIN_IN_TEXT = 4;     // Entity domain mentioned in text (supplementary)
const SCORE_TOKEN_MATCH = 2;        // Token match (weak, supplementary)
const CONFIDENCE_THRESHOLD = 8;     // Domain match, legacy, or subject name; body needs help

/** Words that are too generic to be useful entity name matches */
const GENERIC_FINANCE_WORDS = new Set([
  'capital', 'advisors', 'advisory', 'partners', 'funding',
  'finance', 'financial', 'group', 'holdings', 'ventures',
  'management', 'investments', 'investment', 'consulting',
  'solutions', 'services', 'associates', 'global', 'strategic',
  'line', 'credit', 'lending', 'bank', 'trust',
]);

/**
 * Check if an entity name is too generic / overlaps with the user's own org.
 * Returns true if the name should be skipped for text-based matching.
 */
function isGenericOrSelfEntity(
  entityName: string,
  entityTokens: string[],
  orgCtx?: ClassifierOrgContext,
): boolean {
  // Skip if entity name is a substring of the org's own name or vice-versa
  if (orgCtx?.orgName) {
    const on = orgCtx.orgName;
    if (on.includes(entityName) || entityName.includes(on)) return true;
  }

  // Skip if ALL meaningful tokens are generic finance words
  const meaningful = entityTokens.filter(t => t.length >= 3 && !GENERIC_FINANCE_WORDS.has(t));
  if (meaningful.length === 0 && entityTokens.length > 0) return true;

  // Skip very short names (≤5 chars) for text matching — too many false positives
  if (entityName.length <= 5) return true;

  return false;
}

/**
 * Classify an email into zero or more categories.
 */
export function classifyEmail(
  email: Record<string, any>,
  entities?: ClassifierEntity[],
  orgCtx?: ClassifierOrgContext,
): EmailCategory[] {
  const cats: EmailCategory[] = [];

  // ── Clients & Deals ──────────────────────────────────────────
  let score = 0;

  // Skip marketing / platform noise entirely
  const isNoise = isMarketingOrPlatformNoise(email);

  if (!isNoise) {
    // Legacy flags (explicit deal linkage) — instant qualify
    const category = email.analysis?.category || email.category || '';
    if (
      ['deal_update', 'terms_discussion', 'due_diligence', 'lender_communication', 'follow_up_needed'].includes(category) ||
      email.analysis?.deal_name ||
      email.deal_name ||
      email.is_linked_to_deal
    ) {
      score += SCORE_LEGACY_SIGNAL;
    }

    // Entity-based matching
    if (score < CONFIDENCE_THRESHOLD && entities && entities.length > 0) {
      const subjectLower = norm(email.subject);
      const bodyText = [norm(email.snippet), norm(email.body_preview), norm(email.body_text)].join(' ');
      const emailDomains = collectDomains(email);

      // Remove the user's own org domains from participant domains
      const filteredEmailDomains = new Set(emailDomains);
      if (orgCtx?.orgDomains) {
        for (const od of orgCtx.orgDomains) {
          filteredEmailDomains.delete(od);
        }
      }

      for (const entity of entities) {
        let entityScore = 0;

        // Path A: Domain match — sender/recipient domain matches entity domain
        if (entity.domains.length > 0) {
          for (const entDomain of entity.domains) {
            for (const ed of filteredEmailDomains) {
              if (ed === entDomain || ed.endsWith('.' + entDomain)) {
                entityScore += SCORE_DOMAIN_MATCH;
                break;
              }
            }
            if (entityScore >= CONFIDENCE_THRESHOLD) break;
          }
        }

        // For text-based matching, skip generic/self entities
        if (entityScore < CONFIDENCE_THRESHOLD) {
          const isGeneric = isGenericOrSelfEntity(entity.name, entity.tokens, orgCtx);

          if (!isGeneric) {
            // Exact name in subject (moderate — needs domain or body support)
            if (entity.name.length >= 6 && subjectLower.includes(entity.name)) {
              entityScore += SCORE_EXACT_NAME_SUBJECT;
            }

            // Exact name in body (weak — supplementary only)
            if (entity.name.length >= 6 && bodyText.includes(entity.name)) {
              entityScore += SCORE_EXACT_NAME_BODY;
            }

            // Entity domain mentioned in email text (supplementary)
            if (entity.domains.length > 0) {
              const searchText = buildSearchText(email);
              for (const d of entity.domains) {
                if (searchText.includes(d)) {
                  entityScore += SCORE_DOMAIN_IN_TEXT;
                  break;
                }
              }
            }

            // Token match (very weak — only ever supplementary)
            if (entityScore > 0 && entity.tokens.length >= 2) {
              const searchText = buildSearchText(email);
              if (containsName(searchText, entity.tokens)) {
                entityScore += SCORE_TOKEN_MATCH;
              }
            }
          }
        }

        if (entityScore > score) score = entityScore;
        if (score >= CONFIDENCE_THRESHOLD) break;
      }
    }
  }

  if (score >= CONFIDENCE_THRESHOLD) cats.push('clients_deals');

  // ── Asana & Projects ─────────────────────────────────────────
  const fromEmail = norm(email.from_email);
  const fromName = norm(email.from_name);
  const subject = norm(email.subject);
  const snippet = norm(email.snippet);
  const isAsana =
    fromEmail.includes('asana.com') ||
    fromEmail.includes('mail.asana.com') ||
    subject.includes('asana') ||
    snippet.includes('asana');
  if (isAsana) {
    cats.push('asana_projects');
  }

  // ── Calendar ─────────────────────────────────────────────────
  // Asana takes precedence — never reclassify Asana mail as Calendar.
  if (!isAsana && isCalendarNotification(email, { fromEmail, fromName, subject, snippet })) {
    cats.push('calendar');
  }

  return cats;
}

// ── Calendar notification detection ────────────────────────────

interface CalendarHeuristicCtx {
  fromEmail: string;
  fromName: string;
  subject: string;
  snippet: string;
}

/**
 * Detect Google Calendar / system-generated event notification emails.
 * Looks at sender, subject, and snippet/body heuristics.
 * Centralised here so the rules can be tuned in one place.
 */
export function isCalendarNotification(
  email: Record<string, any>,
  precomputed?: CalendarHeuristicCtx,
): boolean {
  const fromEmail = precomputed?.fromEmail ?? norm(email.from_email);
  const fromName = precomputed?.fromName ?? norm(email.from_name);
  const subject = precomputed?.subject ?? norm(email.subject);
  const snippet = precomputed?.snippet ?? norm(email.snippet);
  const body = norm(email.body_preview) + ' ' + norm(email.body_text);

  // 1. Strong sender signals — Google Calendar's standard sender addresses
  if (
    fromEmail === 'calendar-notification@google.com' ||
    fromEmail.endsWith('@calendar-notification.google.com') ||
    fromEmail.endsWith('@calendar.google.com') ||
    fromEmail.includes('calendar-notification@google') ||
    fromName === 'google calendar' ||
    fromName.includes('google calendar')
  ) {
    return true;
  }

  // 2. Subject-line signals — invite lifecycle prefixes used by Google Calendar
  //    e.g. "Notification: ...", "Invitation: ...", "Updated invitation: ...",
  //         "Accepted: ...", "Declined: ...", "Tentative: ...",
  //         "Canceled: ...", "Cancelled: ...", "Rescheduled: ..."
  const calendarSubjectPrefixes = [
    /^notification:\s/i,
    /^invitation:\s/i,
    /^updated invitation:\s/i,
    /^accepted:\s/i,
    /^declined:\s/i,
    /^tentative:\s/i,
    /^canceled:\s/i,
    /^cancelled:\s/i,
    /^rescheduled:\s/i,
    /^reminder:\s.*\b(meeting|event|invite|calendar)\b/i,
  ];
  if (calendarSubjectPrefixes.some(rx => rx.test(email.subject || ''))) {
    return true;
  }

  // 3. Body / snippet signals — strong calendar-specific phrases
  const text = `${snippet} ${body}`;
  const calendarBodyMarkers = [
    'view your event',
    'view event in google calendar',
    'going (yes - maybe - no)',
    'going? yes - maybe - no',
    'has invited you to the following event',
    'this event has been canceled',
    'this event has been cancelled',
    'this event has been updated',
    'join with google meet',
    'meet.google.com/',
    'rsvp to this event',
    'add to calendar',
  ];
  if (calendarBodyMarkers.some(m => text.includes(m))) {
    return true;
  }

  return false;
}

/**
 * Filter a list of emails by category tab.
 * 'all' returns everything; specific categories return only matching emails.
 */
export function filterEmailsByCategory<T extends Record<string, any>>(
  emails: T[],
  tab: EmailCategoryTab,
  entities?: ClassifierEntity[],
  orgCtx?: ClassifierOrgContext,
): T[] {
  if (tab === 'all') return emails;
  return emails.filter(e => classifyEmail(e, entities, orgCtx).includes(tab));
}
