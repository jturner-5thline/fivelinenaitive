/**
 * Active Deals pipeline stages that were retired (Oct 2026). Historical
 * stage-history rows still reference them; reporting folds their time into
 * the stage that now absorbs them so durations stay complete and no obsolete
 * rows appear. Milestone-to-milestone metrics (entry → entry) need no change
 * because elapsed time between milestones already includes these stages.
 */
export const REMOVED_ACTIVE_STAGE_TARGET: Readonly<Record<string, string>> = {
  'initial-feedback': 'initial-lender-review',
  'proposal-in-development': 'initial-lender-review',
  'client-strategy-review': 'final-credit-items',
};

const compact = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '');
const COMPACT_TO_SLUG: Record<string, string> = Object.fromEntries(
  Object.keys(REMOVED_ACTIVE_STAGE_TARGET).map(slug => [compact(slug), slug]),
);

export function removedStageSlug(stage?: string | null): string | null {
  return COMPACT_TO_SLUG[compact(String(stage ?? ''))] ?? null;
}

export interface StageDurationRow {
  deal_id: string;
  key: string;
  changed_at: string;
  days: number;
}

/**
 * Fold time spent in retired stages into the same deal's preceding row
 * (normally the absorbing stage). If there is no preceding row, re-key the
 * row to the absorbing stage instead.
 */
export function foldRemovedStageDurations<T extends StageDurationRow>(rows: T[]): T[] {
  const byDeal = new Map<string, T[]>();
  for (const r of rows) {
    const list = byDeal.get(r.deal_id) ?? [];
    list.push({ ...r });
    byDeal.set(r.deal_id, list);
  }
  const out: T[] = [];
  for (const list of byDeal.values()) {
    list.sort((a, b) => a.changed_at.localeCompare(b.changed_at));
    let prev: T | null = null;
    for (const r of list) {
      const removed = removedStageSlug(r.key);
      if (removed) {
        if (prev) {
          prev.days += r.days;
          continue;
        }
        r.key = REMOVED_ACTIVE_STAGE_TARGET[removed];
      }
      out.push(r);
      prev = r;
    }
  }
  return out;
}
