import { isActiveDeal } from './deals';
import type { Deal } from '@/types/deal';

/**
 * Stage labels (lowercased) that sit AT or BEFORE "Terms Issued" in the
 * active pipeline. Fallback for when we cannot resolve a deal's pipeline
 * stage list at runtime. Anything beyond Terms Issued (in-diligence,
 * funded, closed-*) is intentionally excluded.
 */
const AT_OR_BEFORE_TERMS_ISSUED_LABELS: ReadonlySet<string> = new Set([
  'initial feedback',
  'final credit items',
  'client strategy review',
  'write up pending',
  'write-up pending',
  'submitted to lenders',
  'lender outreach',
  'lenders in review',
  'term sheets',
  'terms issued',
]);

function norm(s: unknown): string {
  return String(s ?? '').toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Returns true when the deal is in an active stage at or before
 * "Terms Issued". Uses the label allowlist as a safe fallback; can be
 * supplied an ordered stage list (label or id strings) for the deal's
 * pipeline to do precise index comparison.
 */
export function isAtOrBeforeTermsIssued(
  deal: Pick<Deal, 'stage' | 'status'>,
  orderedStageLabels?: string[] | null,
): boolean {
  if (!isActiveDeal(deal)) return false;
  const stage = norm(deal.stage);
  if (!stage) return true;

  if (orderedStageLabels && orderedStageLabels.length) {
    const normalized = orderedStageLabels.map(norm);
    const termsIdx = normalized.findIndex(s => s.includes('terms issued'));
    if (termsIdx >= 0) {
      const currentIdx = normalized.findIndex(s => s === stage || s.includes(stage) || stage.includes(s));
      if (currentIdx >= 0) return currentIdx <= termsIdx;
    }
  }

  return AT_OR_BEFORE_TERMS_ISSUED_LABELS.has(stage);
}