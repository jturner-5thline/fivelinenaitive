/**
 * Client-side helper to check if a deal is in a notification-suppressed state.
 * A deal is suppressed when it is:
 * - Archived (status = 'archived')
 * - On Hold (status = 'on-hold' / 'on_hold', or stage = 'on-hold' / 'on_hold')
 * - In the "In Development" pipeline
 */

const IN_DEVELOPMENT_PIPELINE_NAMES = ['in development', 'in-development'];

export function isDealNotificationSuppressed(deal: {
  status?: string | null;
  stage?: string | null;
  pipeline_id?: string | null;
  pipeline_name?: string | null;
}): boolean {
  const status = (deal.status || '').toLowerCase();
  const stage = (deal.stage || '').toLowerCase();

  if (status === 'archived' || status === 'on-hold' || status === 'on_hold') return true;
  if (stage === 'on-hold' || stage === 'on_hold') return true;

  // Pipeline-based suppression requires knowing the pipeline name
  if (deal.pipeline_name) {
    const pName = deal.pipeline_name.toLowerCase();
    if (IN_DEVELOPMENT_PIPELINE_NAMES.some(n => pName.includes(n))) return true;
  }

  return false;
}

/**
 * Known "In Development" pipeline IDs.
 * Used as a fast check when pipeline_name isn't available.
 */
export const KNOWN_IN_DEVELOPMENT_PIPELINE_IDS = [
  '40b17dfb-9122-49e0-bf7c-5aa993d5d615',
];

export function isDealNotificationSuppressedById(deal: {
  status?: string | null;
  stage?: string | null;
  pipeline_id?: string | null;
}): boolean {
  const status = (deal.status || '').toLowerCase();
  const stage = (deal.stage || '').toLowerCase();

  if (status === 'archived' || status === 'on-hold' || status === 'on_hold') return true;
  if (stage === 'on-hold' || stage === 'on_hold') return true;

  if (deal.pipeline_id && KNOWN_IN_DEVELOPMENT_PIPELINE_IDS.includes(deal.pipeline_id)) return true;

  return false;
}
