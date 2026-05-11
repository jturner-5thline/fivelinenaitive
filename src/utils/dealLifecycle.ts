/**
 * Helpers for determining whether a deal is in an "inactive" lifecycle
 * state where proactive notifications and outstanding-item edits should be
 * suppressed.
 *
 * Inactive includes:
 *   - Closed Won / Closed Lost / Funded-Invoiced / On-Hold / In Due Diligence
 *   - Archived (status=archived)
 *   - Deals belonging to the "In Development" pipeline
 */
import type { Deal } from '@/types/deal';

const INACTIVE_STAGES = new Set<string>([
  'closed-won',
  'closed-lost',
  'funded-invoiced',
  'on-hold',
  'in-due-diligence',
]);

const INACTIVE_PIPELINE_NAMES = new Set<string>([
  'in development',
  'archived pipeline',
]);

export type InactiveReason =
  | 'archived'
  | 'closed-won'
  | 'closed-lost'
  | 'funded'
  | 'on-hold'
  | 'in-due-diligence'
  | 'in-development'
  | null;

export function getDealInactiveReason(
  deal: Pick<Deal, 'stage' | 'status' | 'pipelineId'> | null | undefined,
  pipelineName?: string | null,
): InactiveReason {
  if (!deal) return null;
  if (deal.status === 'archived') return 'archived';
  if (deal.stage === 'closed-won') return 'closed-won';
  if (deal.stage === 'closed-lost') return 'closed-lost';
  if (deal.stage === 'funded-invoiced') return 'funded';
  if (deal.stage === 'on-hold' || deal.status === 'on-hold') return 'on-hold';
  if (deal.stage === 'in-due-diligence') return 'in-due-diligence';
  if (pipelineName && INACTIVE_PIPELINE_NAMES.has(pipelineName.trim().toLowerCase())) {
    return 'in-development';
  }
  return null;
}

export function isDealInactive(
  deal: Pick<Deal, 'stage' | 'status' | 'pipelineId'> | null | undefined,
  pipelineName?: string | null,
): boolean {
  return getDealInactiveReason(deal, pipelineName) !== null;
}

export function inactiveReasonLabel(reason: InactiveReason): string {
  switch (reason) {
    case 'archived': return 'Archived';
    case 'closed-won': return 'Closed Won';
    case 'closed-lost': return 'Closed Lost';
    case 'funded': return 'Funded / Invoiced';
    case 'on-hold': return 'On Hold';
    case 'in-due-diligence': return 'In Due Diligence';
    case 'in-development': return 'In Development';
    default: return '';
  }
}

export { INACTIVE_STAGES };
