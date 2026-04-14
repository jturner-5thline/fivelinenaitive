/**
 * Shared email classification logic used by both Daily Briefing and Email pop-up.
 * Single source of truth for category rules.
 */

export type EmailCategory = 'clients_deals' | 'asana_projects';

export const EMAIL_CATEGORY_TABS = [
  { key: 'all' as const, label: 'All' },
  { key: 'clients_deals' as const, label: 'Clients & Deals' },
  { key: 'asana_projects' as const, label: 'Asana & Projects' },
] as const;

export type EmailCategoryTab = 'all' | EmailCategory;

/**
 * Classify an email into zero or more categories.
 * An email in "All" but matching no category simply has an empty array.
 */
export function classifyEmail(email: {
  from_email?: string;
  subject?: string;
  snippet?: string;
  analysis?: { category?: string; deal_name?: string };
  labels?: string[];
  category?: string;
  deal_name?: string;
  is_linked_to_deal?: boolean;
}): EmailCategory[] {
  const cats: EmailCategory[] = [];

  const category = email.analysis?.category || email.category || '';
  const fromEmail = (email.from_email || '').toLowerCase();
  const subject = (email.subject || '').toLowerCase();
  const snippet = (email.snippet || '').toLowerCase();

  // Clients & Deals
  if (
    ['deal_update', 'terms_discussion', 'due_diligence', 'lender_communication', 'follow_up_needed'].includes(category) ||
    email.analysis?.deal_name ||
    email.deal_name ||
    email.is_linked_to_deal
  ) {
    cats.push('clients_deals');
  }

  // Asana & Projects
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
): T[] {
  if (tab === 'all') return emails;
  return emails.filter(e => classifyEmail(e).includes(tab));
}
