import type { DealLender } from '@/types/deal';

/**
 * Helpers for rendering funding-source status timestamps next to status pills
 * and inside the Lender Pop-up timeline. Year is omitted when it matches the
 * current year. Falls back to `createdAt` (prefixed with `~`) when no
 * status-specific timestamp is recorded.
 */

export type LenderStatusKind = 'submitted' | 'approved' | 'passed' | 'declined';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatShortDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const base = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base}, ${d.getFullYear()}`;
}

export function formatFullTimestamp(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

/** Resolve the primary timestamp + label for the lender's current status. */
export function getPrimaryStatusDate(lender: DealLender): {
  label: string;
  iso: string | null;
  approximate: boolean;
} {
  const ts = (lender.trackingStatus || '').toLowerCase();
  const stage = (lender.stage || '').toLowerCase();

  if (lender.declinedAt || stage === 'declined') {
    return { label: 'Declined', iso: lender.declinedAt ?? null, approximate: !lender.declinedAt };
  }
  if (ts === 'passed' || stage === 'passed' || stage === 'not-a-fit' || stage === 'unresponsive' || stage === 'no-go' || lender.passedAt) {
    return { label: 'Passed', iso: lender.passedAt ?? null, approximate: !lender.passedAt };
  }
  if (stage.includes('term') || stage === 'closed-won' || ts === 'approved' || lender.approvedAt) {
    return { label: 'Approved', iso: lender.approvedAt ?? null, approximate: !lender.approvedAt };
  }
  if (lender.submittedAt) {
    return { label: 'Submitted', iso: lender.submittedAt, approximate: false };
  }
  // Legacy/empty fallback
  return { label: 'Added', iso: lender.createdAt ?? lender.updatedAt ?? null, approximate: true };
}

export interface StatusTimelineEvent {
  kind: LenderStatusKind | 'created';
  label: string;
  iso: string;
  approximate: boolean;
}

/** Build a vertical status history for the Lender Pop-up. */
export function buildStatusTimeline(lender: DealLender): StatusTimelineEvent[] {
  const events: StatusTimelineEvent[] = [];
  if (lender.createdAt) {
    events.push({ kind: 'created', label: 'Added to deal', iso: lender.createdAt, approximate: false });
  }
  if (lender.submittedAt) {
    events.push({ kind: 'submitted', label: 'Submitted', iso: lender.submittedAt, approximate: false });
  }
  if (lender.approvedAt) {
    events.push({ kind: 'approved', label: 'Terms issued / approved', iso: lender.approvedAt, approximate: false });
  }
  if (lender.passedAt) {
    events.push({ kind: 'passed', label: 'Passed', iso: lender.passedAt, approximate: false });
  }
  if (lender.declinedAt) {
    events.push({ kind: 'declined', label: 'Declined', iso: lender.declinedAt, approximate: false });
  }
  return events.sort((a, b) => new Date(b.iso).getTime() - new Date(a.iso).getTime());
}