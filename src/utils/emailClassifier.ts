/**
 * Shared email classification logic used by both Daily Briefing and Email pop-up.
 * Single source of truth for category rules.
 *
 * "Clients & Deals" now matches against real deals/companies from the system
 * via the ClassifierEntity[] data supplied by useEmailClassifierData().
 */

import type { ClassifierEntity } from '@/hooks/useEmailClassifierData';

export type EmailCategory = 'clients_deals' | 'asana_projects';

export const EMAIL_CATEGORY_TABS = [
  { key: 'all' as const, label: 'All' },
  { key: 'clients_deals' as const, label: 'Clients & Deals' },
  { key: 'asana_projects' as const, label: 'Asana & Projects' },
] as const;

export type EmailCategoryTab = 'all' | EmailCategory;

// ── Helpers ────────────────────────────────────────────────────

/** Extract bare domain from an email address */
function domainFromEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 0) return '';
  return email.slice(at + 1).toLowerCase().trim();
}

/** Normalise a text string for matching */
function norm(s: string | undefined | null): string {
  return (s || '').toLowerCase();
}

/** Check if a text contains a multi-word name (all tokens must appear) */
function containsName(text: string, nameTokens: string[]): boolean {
  if (nameTokens.length === 0) return false;
  // For single-token names ≤3 chars, require word-boundary match to avoid false positives
  if (nameTokens.length === 1 && nameTokens[0].length <= 3) return false;
  return nameTokens.every(t => text.includes(t));
}

/** Build a combined searchable text from all email fields */
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

  // Handle array fields
  const arrayFields = ['to_emails', 'cc_emails', 'bcc_emails', 'to_names', 'cc_names'];
  for (const field of arrayFields) {
    const arr = email[field];
    if (Array.isArray(arr)) {
      parts.push(...arr.map((v: string) => norm(v)));
    }
  }

  return parts.join(' ');
}

/** Collect all email-address domains from an email record */
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

// ── Classification ─────────────────────────────────────────────

/**
 * Classify an email into zero or more categories.
 * 
 * @param email   - The email record (from Gmail API / MockEmail / enriched email)
 * @param entities - Deal/company entities from useEmailClassifierData().
 *                   When empty/undefined, falls back to legacy heuristics.
 */
export function classifyEmail(
  email: Record<string, any>,
  entities?: ClassifierEntity[],
): EmailCategory[] {
  const cats: EmailCategory[] = [];

  // ── Clients & Deals ──────────────────────────────────────────
  let isClientsDeal = false;

  // Legacy fallback signals (always check)
  const category = email.analysis?.category || email.category || '';
  if (
    ['deal_update', 'terms_discussion', 'due_diligence', 'lender_communication', 'follow_up_needed'].includes(category) ||
    email.analysis?.deal_name ||
    email.deal_name ||
    email.is_linked_to_deal
  ) {
    isClientsDeal = true;
  }

  // Smart matching against system entities
  if (!isClientsDeal && entities && entities.length > 0) {
    const searchText = buildSearchText(email);
    const emailDomains = collectDomains(email);

    for (const entity of entities) {
      // 1. Domain match (strongest signal)
      if (entity.domains.length > 0) {
        for (const entDomain of entity.domains) {
          // Check if any participant domain matches the entity domain
          for (const ed of emailDomains) {
            if (ed === entDomain || ed.endsWith('.' + entDomain)) {
              isClientsDeal = true;
              break;
            }
          }
          if (isClientsDeal) break;
          // Also check if domain appears in subject/body
          if (searchText.includes(entDomain)) {
            isClientsDeal = true;
            break;
          }
        }
      }
      if (isClientsDeal) break;

      // 2. Full name match in text (broad)
      if (entity.name.length >= 3 && searchText.includes(entity.name)) {
        isClientsDeal = true;
        break;
      }

      // 3. Token-based matching (handles close variations)
      // All significant tokens of the entity name must appear in the email
      if (entity.tokens.length >= 2 && containsName(searchText, entity.tokens)) {
        isClientsDeal = true;
        break;
      }

      // 4. Single significant token (≥4 chars) in subject specifically
      // This catches cases like "Arbolus" or "SoLo Funds" in subject lines
      if (entity.tokens.length === 1 && entity.tokens[0].length >= 4) {
        const subjectLower = norm(email.subject);
        if (subjectLower.includes(entity.tokens[0])) {
          isClientsDeal = true;
          break;
        }
      }
    }
  }

  if (isClientsDeal) cats.push('clients_deals');

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
