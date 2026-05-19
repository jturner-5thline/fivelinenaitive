/**
 * FLEx marketplace visibility helpers.
 *
 * A deal is HIDDEN from FLEx when its stage matches any of the post-
 * solicitation stages below, regardless of slug vs label formatting.
 * Mirrors public.is_flex_hidden_stage() in the database.
 */
const HIDDEN_NORMALIZED = new Set<string>([
  'terms-issued',
  'in-due-diligence',
  'due-diligence',
  'funded-invoiced',
  'funded',
  'invoiced',
  'closed-won',
  'closed-lost',
  'on-hold',
  'paused',
  'deal-paused-on-hold',
  'client-paused-deal',
]);

function normalizeStage(stage: string | null | undefined): string {
  if (!stage) return '';
  return stage
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+)|(-+$)/g, '');
}

export function isFlexHiddenStage(stage: string | null | undefined): boolean {
  return HIDDEN_NORMALIZED.has(normalizeStage(stage));
}

/** Pretty label for a stage slug (e.g. "in-due-diligence" → "In Due Diligence"). */
export function prettyStageLabel(stage: string | null | undefined): string {
  if (!stage) return '';
  if (/[A-Z\s/]/.test(stage)) return stage; // already a label
  return stage
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}