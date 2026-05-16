/**
 * Canonical task-completion + cache-invalidation utilities.
 *
 * Why this file exists
 * --------------------
 * Task completion drifted across the app because each surface kept its
 * own React Query key, its own status literal (`'complete'` vs
 * `'completed'`), and its own optimistic local state. The result: a
 * task marked complete on the Tasks page would still render as open in
 * the Deal Rundown, and vice-versa.
 *
 * Everything that mutates a task MUST:
 *   1. Write the canonical status literal `'complete'` (singular) so
 *      `completed_at` is consistently populated by the mutation layer.
 *   2. Call `invalidateAllTaskCaches(qc)` so every consumer re-reads
 *      from the database — no surface can render a stale completion
 *      state.
 *
 * Everything that READS a task's completion state MUST use
 * `isTaskCompleted(task)` instead of equality-checking `status` —
 * this transparently tolerates the historic `'complete'` /
 * `'completed'` split and a non-null `completed_at` timestamp.
 */
import type { QueryClient } from '@tanstack/react-query';

/** Canonical status literal written by every completion mutation. */
export const TASK_STATUS_COMPLETE = 'complete' as const;
/** Default status used when a task is reopened / undone. */
export const TASK_STATUS_REOPENED = 'not_started' as const;

/**
 * Canonical "is this task done?" check. Treats either historical status
 * literal OR a populated `completed_at` as completed so legacy rows and
 * cross-surface writes never produce drift.
 */
export function isTaskCompleted(
  task: { status?: string | null; completed_at?: string | null } | null | undefined,
): boolean {
  if (!task) return false;
  if (task.status === 'complete' || task.status === 'completed') return true;
  if (task.completed_at) return true;
  return false;
}

/**
 * Every React Query key in the codebase that exposes task rows or
 * task-derived counts. Keep this list exhaustive — adding a new
 * task-aware query without adding it here re-opens the original bug.
 */
const TASK_QUERY_KEYS: readonly (readonly unknown[])[] = [
  ['my-tasks'],
  ['contact-tasks'],
  ['crm-company-tasks'],
  ['deal-tasks'],
  ['pipeline-deal-tasks'],
  ['pipeline-digests'],
  ['outstanding-items'],
  ['task-activity'],
  ['task-notifications'],
  ['assignee-open-task-counts'],
  ['task-deals'],
  ['task-contacts'],
  ['task-crm-companies'],
] as const;

/**
 * Invalidate every task-related cache so all surfaces (Tasks page,
 * Daily Rundown, Deal Rundown, Deal detail panel, CRM detail panels,
 * dashboard widgets, copilot cards, etc.) re-read the canonical row.
 */
export function invalidateAllTaskCaches(qc: QueryClient): void {
  for (const key of TASK_QUERY_KEYS) {
    // `exact: false` so prefix-keyed queries like
    // `['my-tasks', ownerFilter]` or `['deal-tasks', dealId]` are
    // invalidated by their root key.
    qc.invalidateQueries({ queryKey: key as unknown[], exact: false });
  }
}