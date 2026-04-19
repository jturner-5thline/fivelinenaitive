/**
 * Shared eligibility filter for "Lender Needs Attention" notifications.
 *
 * Used by BOTH the in-app notification queries (NotificationsDropdown,
 * NotificationCarousel, Notifications page) AND the email digest job
 * (supabase/functions/check-stale-deals).
 *
 * A lender is eligible to be flagged as "needs attention" only when:
 *   - Its stage is NOT in EXCLUDED_LENDER_STAGES
 *   - Its parent deal is NOT On Hold or Archived
 *   - Neither the deal nor the lender is_archived
 *
 * Keep this list in sync with the edge function's `EXCLUDED_LENDER_STAGES`.
 */

export const EXCLUDED_LENDER_STAGES_NORMALIZED = new Set<string>([
  'on deck',
  'on-deck',
  'on hold',
  'on-hold',
  'passed',
  'not a fit',
  'not-a-fit',
  'unresponsive',
  'excluded',
  'closed & funded',
  'closed-funded',
  'closed funded',
]);

export const EXCLUDED_DEAL_STATUSES_NORMALIZED = new Set<string>([
  'on hold',
  'on-hold',
  'on_hold',
  'archived',
]);

function norm(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export interface AttentionLenderShape {
  stage?: string | null;
  trackingStatus?: string | null;
  is_archived?: boolean | null;
}

export interface AttentionDealShape {
  status?: string | null;
  stage?: string | null;
  is_archived?: boolean | null;
}

/**
 * Returns true when the lender (under this deal) is eligible to be surfaced
 * as a "needs attention" item. Returns false to suppress.
 */
export function isLenderEligibleForAttention(
  lender: AttentionLenderShape | null | undefined,
  deal: AttentionDealShape | null | undefined,
): boolean {
  if (!lender || !deal) return false;
  if (lender.is_archived === true) return false;
  if (deal.is_archived === true) return false;

  const lenderStage = norm(lender.stage);
  const lenderTracking = norm(lender.trackingStatus);
  if (EXCLUDED_LENDER_STAGES_NORMALIZED.has(lenderStage)) return false;
  if (EXCLUDED_LENDER_STAGES_NORMALIZED.has(lenderTracking)) return false;

  const dealStatus = norm(deal.status);
  const dealStage = norm(deal.stage);
  if (EXCLUDED_DEAL_STATUSES_NORMALIZED.has(dealStatus)) return false;
  // Defensive: deal stage occasionally encodes on-hold
  if (dealStage === 'on-hold' || dealStage === 'on hold' || dealStage === 'on_hold') return false;

  return true;
}
