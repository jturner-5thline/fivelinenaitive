/**
 * Shared rules for deciding whether a funding source counts as "active" on a deal.
 * Used by both the lender directory badge counts and the lender detail dialog so
 * the "N active" badge always matches the Active Deals list.
 */

export const normalizeLenderStatus = (v?: string | null) =>
  String(v ?? '').toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Funding-source level statuses/stages that disqualify from "Active Deals". */
const INACTIVE_LENDER_STATES = new Set([
  'passed',
  'pass',
  'unresponsive',
  'not a fit',
  'notafit',
  'on deck',
  'on hold',
  'excluded',
  'declined',
]);

export interface LenderDealLenderLike {
  trackingStatus?: string | null;
  stage?: string | null;
  excludedAt?: string | null;
}

export interface LenderDealLike {
  status?: string | null;
  stage?: string | null;
  pipelineId?: string | null;
  pipelineName?: string | null;
}

export const isInactiveDealLender = (dl: LenderDealLenderLike) =>
  Boolean(dl.excludedAt) ||
  INACTIVE_LENDER_STATES.has(normalizeLenderStatus(dl.trackingStatus)) ||
  INACTIVE_LENDER_STATES.has(normalizeLenderStatus(dl.stage));

/**
 * Deal-level disqualifiers: On Hold, Archived, closed, or the "In Development" pipeline.
 * `resolveStageLabel` resolves overloaded stage IDs to their per-pipeline label.
 */
export const isInactiveDealForLenders = (
  deal: LenderDealLike,
  pipelineNameById: Map<string, string>,
  resolveStageLabel?: (stageId: string, pipelineId: string | null) => string,
) => {
  const status = normalizeLenderStatus(deal.status);
  const stage = normalizeLenderStatus(deal.stage);
  if (status === 'on hold' || status === 'archived') return true;
  if (stage === 'on hold' || stage === 'archived') return true;
  if (status === 'closed won' || status === 'closed lost') return true;

  const label = resolveStageLabel
    ? normalizeLenderStatus(resolveStageLabel(String(deal.stage ?? ''), deal.pipelineId ?? null))
    : stage;
  if (label === 'closed won' || label === 'closed lost') return true;

  const pName = normalizeLenderStatus(deal.pipelineName)
    || (deal.pipelineId ? pipelineNameById.get(deal.pipelineId) ?? '' : '');
  return pName === 'in development';
};

/** True when this funding source should appear under a deal's "Active Deals". */
export const isActiveLenderDeal = (
  deal: LenderDealLike,
  dealLender: LenderDealLenderLike,
  pipelineNameById: Map<string, string>,
  resolveStageLabel?: (stageId: string, pipelineId: string | null) => string,
) =>
  !isInactiveDealLender(dealLender) &&
  !isInactiveDealForLenders(deal, pipelineNameById, resolveStageLabel) &&
  normalizeLenderStatus(dealLender.trackingStatus) === 'active';
