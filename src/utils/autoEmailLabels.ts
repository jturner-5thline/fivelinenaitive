// Client-side evaluation of email_label_rules so personal/team labels
// (e.g. Niki's "From James") render as chips on email rows without
// requiring a background job to materialize email_thread_labels for
// every Gmail thread.
//
// A label matches an email if ANY of its active rules matches (OR semantics).
// Field semantics mirror the rule definitions in useEmailLabels.ts.

import type { EmailLabel, EmailLabelRule } from '@/hooks/useEmailLabels';

export interface AutoLabelEmailLike {
  from_email?: string | null;
  from_name?: string | null;
  to_email?: string | null;
  to_emails?: string[] | null;
  subject?: string | null;
  snippet?: string | null;
  body_text?: string | null;
  body_html?: string | null;
  body_preview?: string | null;
  deal_name?: string | null;
  category?: string | null;
}

function getFieldValue(email: AutoLabelEmailLike, field: EmailLabelRule['field']): string {
  switch (field) {
    case 'sender_email':
      return (email.from_email || '').toLowerCase();
    case 'sender_domain': {
      const e = (email.from_email || '').toLowerCase();
      const at = e.lastIndexOf('@');
      return at >= 0 ? e.slice(at + 1) : '';
    }
    case 'recipient_email': {
      const list = email.to_emails && email.to_emails.length
        ? email.to_emails
        : email.to_email ? [email.to_email] : [];
      return list.map(s => (s || '').toLowerCase()).join(' ');
    }
    case 'subject':
      return (email.subject || '').toLowerCase();
    case 'body':
      // Combine all body-like surfaces so forwards / quoted replies match too.
      return [email.body_text, email.body_html, email.body_preview, email.snippet]
        .filter(Boolean)
        .join('\n')
        .toLowerCase();
    case 'deal_name':
      return (email.deal_name || '').toLowerCase();
    case 'category':
      return (email.category || '').toLowerCase();
    default:
      return '';
  }
}

function ruleMatches(rule: EmailLabelRule, email: AutoLabelEmailLike): boolean {
  if (!rule.is_active) return false;
  const fieldVal = getFieldValue(email, rule.field);
  const target = (rule.value || '').toLowerCase();
  if (!target) return false;
  switch (rule.operator) {
    case 'contains':
      return fieldVal.includes(target);
    case 'equals':
      return fieldVal === target;
    case 'starts_with':
      return fieldVal.startsWith(target);
    case 'ends_with':
      return fieldVal.endsWith(target);
    case 'regex':
      try { return new RegExp(target, 'i').test(fieldVal); } catch { return false; }
    default:
      return false;
  }
}

/** Returns the labels that match this email based on their active rules. */
export function evaluateAutoLabels(
  email: AutoLabelEmailLike,
  labels: EmailLabel[],
  rules: EmailLabelRule[],
): EmailLabel[] {
  if (!labels.length || !rules.length) return [];
  const rulesByLabel = new Map<string, EmailLabelRule[]>();
  for (const r of rules) {
    if (!r.is_active) continue;
    const arr = rulesByLabel.get(r.label_id) || [];
    arr.push(r);
    rulesByLabel.set(r.label_id, arr);
  }
  const matched: EmailLabel[] = [];
  for (const label of labels) {
    const labelRules = rulesByLabel.get(label.id);
    if (!labelRules || !labelRules.length) continue;
    if (labelRules.some(r => ruleMatches(r, email))) {
      matched.push(label);
    }
  }
  return matched;
}

/** Convenience: returns true if any rule of any label matches. */
export function hasAnyAutoLabel(
  email: AutoLabelEmailLike,
  labels: EmailLabel[],
  rules: EmailLabelRule[],
): boolean {
  return evaluateAutoLabels(email, labels, rules).length > 0;
}