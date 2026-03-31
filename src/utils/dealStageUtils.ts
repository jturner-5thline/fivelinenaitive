/**
 * Stages at or beyond "Submitted to Lenders" where lender notifications are enabled.
 */
const POST_SUBMISSION_STAGES: string[] = [
  'submitted-to-lenders',
  'lenders-in-review',
  'terms-issued',
  'in-due-diligence',
  'funded-invoiced',
  'closed-won',
  'closed-lost',
];

/**
 * Returns true if the deal stage is at or beyond "Submitted to Lenders",
 * meaning lender stale/update notifications should be active.
 * For any pre-submission stage, returns false — no lender alerts should fire.
 */
export function isPostSubmissionDealStage(stage?: string | null): boolean {
  if (!stage) return false;
  return POST_SUBMISSION_STAGES.includes(stage.toLowerCase());
}
