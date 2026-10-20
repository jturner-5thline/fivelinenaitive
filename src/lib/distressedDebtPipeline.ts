/**
 * "Distressed Debt" — a 5th Line-only, fully isolated pipeline. Deals can
 * never move into or out of it (enforced in the UI here and by a database
 * trigger), and its deals are excluded from Debt / Sales & BD metrics via
 * deal_class = 'distressed'.
 */
import type { DealStageOption } from '@/contexts/DealStagesContext';

export const DISTRESSED_DEBT_PIPELINE_NAME = 'Distressed Debt';
export const DISTRESSED_DEAL_CLASS = 'distressed' as const;

export const DISTRESSED_DEBT_STAGES: DealStageOption[] = [
  { id: 'dd-initial-review', label: 'Initial Review', color: 'bg-slate-500' },
  { id: 'dd-preview', label: 'Preview', color: 'bg-blue-500' },
  { id: 'dd-diligence', label: 'Diligence', color: 'bg-amber-500' },
  { id: 'dd-closed-funded', label: 'Closed & Funded', color: 'bg-teal-500' },
  { id: 'dd-closed-won', label: 'Closed Won', color: 'bg-green-500' },
  { id: 'dd-closed-lost', label: 'Closed Lost', color: 'bg-red-500' },
];

export function isDistressedDebtPipeline(p?: { name?: string | null } | null): boolean {
  return (p?.name || '').trim().toLowerCase() === DISTRESSED_DEBT_PIPELINE_NAME.toLowerCase();
}

/**
 * Which pipelines a deal may be moved to. A Distressed Debt deal may only
 * "move" within its own pipeline; any other deal never sees Distressed Debt.
 */
export function allowedMoveTargets<P extends { id: string; name: string }>(
  pipelines: P[],
  currentPipelineId: string | null | undefined,
): P[] {
  const current = pipelines.find((p) => p.id === currentPipelineId);
  if (isDistressedDebtPipeline(current)) return pipelines.filter((p) => p.id === current!.id);
  return pipelines.filter((p) => !isDistressedDebtPipeline(p));
}
