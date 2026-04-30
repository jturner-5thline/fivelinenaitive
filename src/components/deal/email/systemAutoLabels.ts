// System (virtual) email labels — not stored in the database. They are
// derived at render time from email metadata so they auto-apply without any
// user action, and the inbox treats them like first-class labels for both
// row tinting and filter chips.
import type { EmailLabel } from '@/hooks/useEmailLabels';

/** Stable id prefix so callers can detect virtual labels and skip DB writes. */
export const SYSTEM_LABEL_PREFIX = 'system:';

export const SYSTEM_LABEL_JTURNER_ID = `${SYSTEM_LABEL_PREFIX}jturner`;
const JTURNER_EMAIL = 'jturner@5thline.co';

/** All known system labels, surfaced everywhere DB labels are surfaced. */
export const SYSTEM_LABELS: EmailLabel[] = [
  {
    id: SYSTEM_LABEL_JTURNER_ID,
    user_id: 'system',
    name: 'jturner@5thline.co',
    color: '#0ea5e9', // sky — Settings palette uses hex, manage dialog uses tokens; labelSwatch handles both
    icon: null,
    description: 'Auto-tag for any message sent from or received at jturner@5thline.co',
    sort_order: -1,
    is_shared: true,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    scope: 'team',
    is_default: false,
  },
];

function eq(a: string | null | undefined, b: string): boolean {
  return !!a && a.trim().toLowerCase() === b.toLowerCase();
}

/** True when the email matches a given system label's auto-tag rule. */
export function emailMatchesSystemLabel(
  email: { from_email?: string | null; to_email?: string | null },
  labelId: string,
): boolean {
  if (labelId === SYSTEM_LABEL_JTURNER_ID) {
    return eq(email.from_email, JTURNER_EMAIL) || eq(email.to_email, JTURNER_EMAIL);
  }
  return false;
}

/** Return the system labels that auto-apply to this email. */
export function systemLabelsForEmail(email: {
  from_email?: string | null;
  to_email?: string | null;
}): EmailLabel[] {
  return SYSTEM_LABELS.filter((l) => emailMatchesSystemLabel(email, l.id));
}

export function isSystemLabelId(id: string): boolean {
  return id.startsWith(SYSTEM_LABEL_PREFIX);
}