import { splitContactTypes, joinContactTypes } from '@/components/contacts/ContactTypeMultiSelect';

export interface ContactTaggingRule {
  id: string;
  company_id: string;
  name: string | null;
  match_field: 'domain' | 'email';
  match_operator: 'is' | 'contains';
  match_value: string;
  tag: string;
  is_active: boolean;
  priority: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function normalizeDomain(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0]
    .trim();
}

export function emailDomain(email: string | null | undefined): string {
  if (!email) return '';
  const parts = email.trim().toLowerCase().split('@');
  return parts.length > 1 ? normalizeDomain(parts[1]) : '';
}

export interface TaggableContact {
  email?: string | null;
  website_url?: string | null;
  contact_type?: string | null;
}

export function ruleMatches(rule: ContactTaggingRule, contact: TaggableContact): boolean {
  if (!rule.is_active) return false;
  const needle = (rule.match_field === 'domain' ? normalizeDomain(rule.match_value) : rule.match_value.trim().toLowerCase());
  if (!needle) return false;

  if (rule.match_field === 'email') {
    const email = (contact.email || '').trim().toLowerCase();
    if (!email) return false;
    return rule.match_operator === 'is' ? email === needle : email.includes(needle);
  }

  const candidates = [emailDomain(contact.email), normalizeDomain(contact.website_url)].filter(Boolean);
  if (!candidates.length) return false;
  return candidates.some(d => (rule.match_operator === 'is' ? d === needle : d.includes(needle)));
}

/** Returns tags added by matching rules (excluding tags already present). */
export function tagsForContact(rules: ContactTaggingRule[], contact: TaggableContact): string[] {
  const existing = new Set(splitContactTypes(contact.contact_type).map(t => t.toLowerCase()));
  const added: string[] = [];
  for (const rule of [...rules].sort((a, b) => a.priority - b.priority)) {
    if (!ruleMatches(rule, contact)) continue;
    const tag = rule.tag.trim();
    if (!tag || existing.has(tag.toLowerCase())) continue;
    existing.add(tag.toLowerCase());
    added.push(tag);
  }
  return added;
}

/** Returns the new contact_type string, or null when nothing changes. */
export function applyTaggingRules(rules: ContactTaggingRule[], contact: TaggableContact): string | null {
  const added = tagsForContact(rules, contact);
  if (!added.length) return null;
  return joinContactTypes([...splitContactTypes(contact.contact_type), ...added]);
}
