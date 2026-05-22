import type { DealLender } from '@/types/deal';

/**
 * Helpers for rendering funding-source status timestamps next to status pills
 * and inside the Lender Pop-up timeline. Year is omitted when it matches the
 * current year. Falls back to `createdAt` (prefixed with `~`) when no
 * status-specific timestamp is recorded.
 */

export type LenderStatusKind = 'submitted' | 'approved' | 'passed' | 'declined' | 'excluded' | 'on_hold' | 'on_deck';

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

  if (ts === 'excluded' || stage === 'excluded' || lender.excludedAt) {
    return { label: 'Excluded', iso: lender.excludedAt ?? lender.updatedAt ?? null, approximate: !lender.excludedAt };
  }

  if (ts === 'on-hold' || ts === 'on hold' || stage === 'on-hold' || stage === 'on hold' || lender.onHoldAt) {
    return { label: 'On Hold', iso: lender.onHoldAt ?? lender.updatedAt ?? null, approximate: !lender.onHoldAt };
  }

  if (ts === 'on-deck' || ts === 'on deck' || stage === 'on-deck' || stage === 'on deck' || lender.onDeckAt) {
    return { label: 'On Deck', iso: lender.onDeckAt ?? lender.updatedAt ?? null, approximate: !lender.onDeckAt };
  }

  if (lender.declinedAt || stage === 'declined') {
    return { label: 'Declined', iso: lender.declinedAt ?? lender.updatedAt ?? null, approximate: !lender.declinedAt };
  }
  if (ts === 'passed' || stage === 'passed' || stage === 'not-a-fit' || stage === 'unresponsive' || stage === 'no-go' || lender.passedAt) {
    return { label: 'Passed', iso: lender.passedAt ?? lender.updatedAt ?? null, approximate: !lender.passedAt };
  }
  if (stage.includes('term') || stage === 'closed-won' || ts === 'approved' || lender.approvedAt) {
    return { label: 'Approved', iso: lender.approvedAt ?? lender.updatedAt ?? null, approximate: !lender.approvedAt };
  }
  if (lender.submittedAt || ts === 'active' || ts === 'in review') {
    return { label: 'Submitted', iso: lender.submittedAt ?? lender.updatedAt ?? null, approximate: !lender.submittedAt };
  }
  // Legacy/empty fallback
  return { label: 'Updated', iso: lender.updatedAt ?? lender.createdAt ?? null, approximate: true };
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
  if (lender.onDeckAt) {
    events.push({ kind: 'on_deck', label: 'On Deck', iso: lender.onDeckAt, approximate: false });
  }
  if (lender.onHoldAt) {
    events.push({ kind: 'on_hold', label: 'On Hold', iso: lender.onHoldAt, approximate: false });
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
  if (lender.excludedAt) {
    events.push({ kind: 'excluded', label: 'Excluded', iso: lender.excludedAt, approximate: false });
  }
  return events.sort((a, b) => new Date(b.iso).getTime() - new Date(a.iso).getTime());
}