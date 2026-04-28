/**
 * Pure helper: infer the lender "status" (LENDER_STATUS_CONFIG id) from
 * free-form text. Used as a client-side fallback in EmailUnifiedAiAction
 * when the AI omits `lender.status` for a "note" intent so the user's
 * intent ("set Founders First to In Diligence") still persists onto the
 * deal_lenders row.
 *
 * Mapping mirrors src/types/deal.ts > LENDER_STATUS_CONFIG.
 */
export type InferredLenderStatus =
  | 'in-review'
  | 'terms-issued'
  | 'in-diligence'
  | 'closed-funded';

export function inferLenderStatus(
  ...sources: Array<string | undefined | null>
): InferredLenderStatus | undefined {
  const haystack = sources.filter(Boolean).join(' ').toLowerCase();
  if (!haystack) return undefined;

  // Order matters: more specific patterns first.
  if (/(in[\s-]?diligence|due[\s-]?diligence|in[\s-]?dd\b|under[\s-]?dd\b|underwriting|credit[\s-]?committee)/.test(haystack)) {
    return 'in-diligence';
  }
  if (/(closed[\s-]?(?:and[\s-]?)?funded|\bfunded\b)/.test(haystack)) {
    return 'closed-funded';
  }
  if (/(term[\s-]?sheet|terms?[\s-]?issued|issued[\s-]?terms?|draft[\s-]?terms?|proposal)/.test(haystack)) {
    return 'terms-issued';
  }
  if (/(in[\s-]?review|reviewing|evaluating|under[\s-]?review)/.test(haystack)) {
    return 'in-review';
  }
  return undefined;
}
