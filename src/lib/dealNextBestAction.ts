import { differenceInCalendarDays } from 'date-fns';
import type { Deal } from '@/types/deal';
import type { DealTaskItem } from '@/hooks/usePipelineDealTasks';
import type { PipelineDigestRaw } from '@/hooks/usePipelineDigests';

export interface NextBestAction {
  /** One-liner shown in the row. */
  copy: string;
  /** Pre-fill title for the task creation form. */
  taskTitle: string;
}

function dealLabel(deal: Deal): string {
  return deal.company || deal.name || 'this deal';
}

function lastActivityIso(deal: Deal, raw?: PipelineDigestRaw): string | null {
  const candidates: (string | null | undefined)[] = [];
  if (raw) {
    raw.activities?.forEach((a) => {
      if (a.deal_id === deal.id) candidates.push(a.created_at);
    });
    raw.emails?.forEach((e: any) => candidates.push(e?.received_at));
    raw.meetings?.forEach((m: any) => {
      if (m.deal_id === deal.id) candidates.push(m.started_at);
    });
  }
  const ts = candidates
    .filter(Boolean)
    .map((s) => new Date(s as string).getTime())
    .filter((n) => Number.isFinite(n));
  if (!ts.length) return null;
  return new Date(Math.max(...ts)).toISOString();
}

function overdueCount(tasks: DealTaskItem[] | undefined): number {
  if (!tasks?.length) return 0;
  const now = new Date();
  return tasks.filter((t) => t.dueDate && differenceInCalendarDays(new Date(t.dueDate), now) < 0).length;
}

/**
 * Compute a deal-card "Next best action" suggestion from data already
 * loaded on the page (no extra fetch). Returns null when no clear action
 * applies — the caller must hide the row in that case.
 *
 * Heuristic order (highest signal first):
 *   1. Overdue open tasks → review & reassign.
 *   2. Long silence (>14d, with some prior activity) → status update.
 *   3. Stale-ish (>7d) → check in.
 *   4. Otherwise: no row.
 */
export function computeDealNextBestAction(
  deal: Deal,
  tasks: DealTaskItem[] | undefined,
  rawDigest: PipelineDigestRaw | undefined,
): NextBestAction | null {
  const label = dealLabel(deal);
  const od = overdueCount(tasks || []);
  if (od > 0) {
    return {
      copy: `${od} overdue task${od === 1 ? '' : 's'} — review and reassign`,
      taskTitle: `Review overdue items on ${label}`,
    };
  }

  const lastIso = lastActivityIso(deal, rawDigest);
  if (lastIso) {
    const days = differenceInCalendarDays(new Date(), new Date(lastIso));
    if (days >= 14) {
      return {
        copy: `No activity in ${days} days — send a status update`,
        taskTitle: `Follow up on ${label}`,
      };
    }
    if (days >= 7) {
      return {
        copy: `No activity in ${days} days — check in on status`,
        taskTitle: `Check in on status of ${label}`,
      };
    }
  }

  return null;
}

/**
 * Pre-fill rule for the "+ Add Follow-up" form on a deal card. Always
 * returns a sensible title — the form falls back to a generic follow-up
 * when no other rule fires.
 */
export function prefillFollowupTitle(
  deal: Deal,
  tasks: DealTaskItem[] | undefined,
  rawDigest: PipelineDigestRaw | undefined,
): string {
  const action = computeDealNextBestAction(deal, tasks, rawDigest);
  if (action) return action.taskTitle;
  const label = dealLabel(deal);
  // No-lender-response heuristic: the digest exposes per-deal lender
  // emails via activities/emails — when nothing inbound exists at all we
  // bias toward a lender-focused follow-up.
  const hadAny = !!lastActivityIso(deal, rawDigest);
  if (!hadAny) return `Follow up with lenders on ${label}`;
  return `Follow up on ${label}`;
}

function nextBusinessDay(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

export function defaultDueDate(): Date {
  return nextBusinessDay();
}