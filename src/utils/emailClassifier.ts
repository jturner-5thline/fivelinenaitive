/**
 * Shared email classification logic used by both Daily Briefing and Email pop-up.
 * Single source of truth for category rules.
 *
 * "Clients & Deals" uses a confidence-scored approach: domain matches are strong,
 * exact name matches are moderate, and fuzzy/token matches are weak (require
 * a second signal). Marketing / platform noise is explicitly excluded.
 */

import type { ClassifierEntity } from '@/hooks/useEmailClassifierData';

export type EmailCategory = 'clients_deals' | 'asana_projects';

export const EMAIL_CATEGORY_TABS = [
  { key: 'all' as const, label: 'All' },
  { key: 'clients_deals' as const, label: 'Clients & Deals' },
  { key: 'asana_projects' as const, label: 'Asana & Projects' },
] as const;

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

const SCORE_DOMAIN_MATCH = 10;     // Domain match = instant qualify
const SCORE_EXACT_NAME_SUBJECT = 6; // Exact entity name in subject
const SCORE_EXACT_NAME_BODY = 4;    // Exact entity name in body/snippet
const SCORE_TOKEN_MATCH = 2;        // All tokens present
const SCORE_LEGACY_SIGNAL = 8;      // Legacy deal-linked flags
const CONFIDENCE_THRESHOLD = 6;     // Minimum score to classify

/**
 * Classify an email into zero or more categories.
 */
export function classifyEmail(
  email: Record<string, any>,
  entities?: ClassifierEntity[],
): EmailCategory[] {
  const cats: EmailCategory[] = [];

  // ── Clients & Deals ──────────────────────────────────────────
  let score = 0;

  // Skip marketing / platform noise entirely
  const isNoise = isMarketingOrPlatformNoise(email);

  if (!isNoise) {
    // Legacy flags (explicit deal linkage) — very strong
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

      for (const entity of entities) {
        let entityScore = 0;

        // 1. Domain match (strongest signal)
        if (entity.domains.length > 0) {
          for (const entDomain of entity.domains) {
            for (const ed of emailDomains) {
              if (ed === entDomain || ed.endsWith('.' + entDomain)) {
                entityScore += SCORE_DOMAIN_MATCH;
                break;
              }
            }
            if (entityScore >= CONFIDENCE_THRESHOLD) break;
          }
        }

        // 2. Exact name in subject (strong)
        if (entity.name.length >= 4 && subjectLower.includes(entity.name)) {
          entityScore += SCORE_EXACT_NAME_SUBJECT;
        }

        // 3. Exact name in body (moderate)
        if (entityScore < CONFIDENCE_THRESHOLD && entity.name.length >= 4 && bodyText.includes(entity.name)) {
          entityScore += SCORE_EXACT_NAME_BODY;
        }

        // 4. Token match (weak — only contributes, doesn't qualify alone)
        if (entityScore > 0 && entityScore < CONFIDENCE_THRESHOLD && entity.tokens.length >= 2) {
          const searchText = buildSearchText(email);
          if (containsName(searchText, entity.tokens)) {
            entityScore += SCORE_TOKEN_MATCH;
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
  const subject = norm(email.subject);
  const snippet = norm(email.snippet);
  if (
    fromEmail.includes('asana.com') ||
    fromEmail.includes('mail.asana.com') ||
    subject.includes('asana') ||
    snippet.includes('asana')
  ) {
    cats.push('asana_projects');
  }

  return cats;
}

/**
 * Filter a list of emails by category tab.
 * 'all' returns everything; specific categories return only matching emails.
 */
export function filterEmailsByCategory<T extends Record<string, any>>(
  emails: T[],
  tab: EmailCategoryTab,
  entities?: ClassifierEntity[],
): T[] {
  if (tab === 'all') return emails;
  return emails.filter(e => classifyEmail(e, entities).includes(tab));
}
