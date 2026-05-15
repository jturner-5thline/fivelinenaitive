import type { DealLender } from '@/types/deal';
import { LENDER_STAGE_CONFIG } from '@/types/deal';

export type LenderBucketKey = 'onDeck' | 'inReview' | 'termsIssued' | 'passed';

const norm = (s?: string) => (s || '').toLowerCase().replace(/[_-]+/g, ' ').trim();

const ON_DECK_LABELS = ['sent drl', 'on deck', 'drl sent', 'data room sent'];
const IN_REVIEW_LABELS = ['in review', 'lenders in review', 'active', 'reviewing drl', 'reviewing', 'management call set', 'management call completed'];
const TERMS_LABELS = ['terms issued', 'term sheets', 'term sheet', 'draft terms', 'draft term sheet'];
const PASSED_LABELS = ['passed', 'pass', 'declined', 'no go'];
const EXCLUDED_LABELS = ['excluded', 'on hold', 'hold'];

function stageLabel(lender: DealLender, configured?: { id: string; label: string }[]): string {
  const fromConfigured = configured?.find((s) => s.id === lender.stage)?.label;
  if (fromConfigured) return fromConfigured;
  const fromBuiltIn = LENDER_STAGE_CONFIG[lender.stage]?.label;
  if (fromBuiltIn) return fromBuiltIn;
  return String(lender.stage || '');
}

/** Bucket a lender into On Deck / In Review / Terms Issued / Passed using
 *  trackingStatus first, then falling back to stage labels (case/format-insensitive). */
/** Returns true if a lender should be hidden from any client-facing report.
 *  Excluded covers the 'Excluded' and 'On Hold' lender stages/tracking. */
export function isExcludedFromClientReport(
  lender: DealLender,
  configuredStages?: { id: string; label: string }[],
): boolean {
  const ts = norm(lender.trackingStatus);
  if (ts === 'on hold' || ts === 'excluded') return true;
  const label = norm(stageLabel(lender, configuredStages));
  const stageId = norm(lender.stage);
  if (EXCLUDED_LABELS.includes(label) || EXCLUDED_LABELS.includes(stageId)) return true;
  return false;
}

export function bucketLender(
  lender: DealLender,
  configuredStages?: { id: string; label: string }[],
): LenderBucketKey | null {
  if (isExcludedFromClientReport(lender, configuredStages)) return null;
  const ts = norm(lender.trackingStatus);
  if (ts === 'passed' || ts === 'pass') return 'passed';

  const label = norm(stageLabel(lender, configuredStages));
  const stageId = norm(lender.stage);

  if (PASSED_LABELS.includes(label) || PASSED_LABELS.includes(stageId)) return 'passed';
  if (TERMS_LABELS.some((l) => label.includes(l)) || stageId.includes('term')) return 'termsIssued';
  if (
    ON_DECK_LABELS.some((l) => label.includes(l)) ||
    ON_DECK_LABELS.some((l) => stageId.includes(l)) ||
    ts === 'on deck'
  ) {
    return 'onDeck';
  }
  if (
    IN_REVIEW_LABELS.some((l) => label.includes(l)) ||
    ts === 'active' ||
    ts === 'in review'
  ) {
    return 'inReview';
  }
  // Default: active tracking → in review, otherwise on deck.
  if (ts === 'active') return 'inReview';
  return 'onDeck';
}

export interface LenderBuckets {
  onDeck: DealLender[];
  inReview: DealLender[];
  termsIssued: DealLender[];
  passed: DealLender[];
}

export function bucketLenders(
  lenders: DealLender[] | undefined,
  configuredStages?: { id: string; label: string }[],
): LenderBuckets {
  const out: LenderBuckets = { onDeck: [], inReview: [], termsIssued: [], passed: [] };
  for (const l of lenders || []) {
    const b = bucketLender(l, configuredStages);
    if (b) out[b].push(l);
  }
  return out;
}

/** Extract a concise pass reason + key feedback from a lender's notes / passReason field.
 *  Heuristics:
 *  - Use lender.passReason if present.
 *  - Otherwise scan notes for "Pass - X", "Pass: X", "Passed: X", "Reason: X".
 *  - "Key feedback" = remaining note text, trimmed to ~180 chars. */
export function extractPassDetails(lender: DealLender): { reason: string; feedback: string } {
  const explicit = (lender.passReason || '').trim();
  const rawNotes = (lender.notes || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

  let reason = explicit;
  let feedback = rawNotes;

  if (!reason && rawNotes) {
    const m = rawNotes.match(/(?:^|\n)\s*(?:pass(?:ed)?|reason)\s*[-:–]\s*([^\n]+)/i);
    if (m) {
      reason = m[1].trim();
      feedback = (rawNotes.slice(0, m.index!) + rawNotes.slice(m.index! + m[0].length)).trim();
    }
  }

  if (!reason) reason = 'See advisor notes';
  // Cap feedback length so the report stays one-page-friendly.
  if (feedback.length > 220) feedback = feedback.slice(0, 217).trimEnd() + '…';
  return { reason, feedback };
}