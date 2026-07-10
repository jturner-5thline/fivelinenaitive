/**
 * "Projects" pipeline — a fully siloed pipeline (currently used by the
 * Blount Capital account) that must NEVER factor into deal metrics,
 * counts, or dashboards, and whose deals cannot be moved into or out
 * of it. Detection is name-based so it works per-tenant without any
 * hardcoded company ID checks.
 */
export const PROJECTS_PIPELINE_NAME = 'Projects';

interface PipelineLike { id: string; name: string }

export function isProjectsPipeline(p?: { name?: string | null } | null): boolean {
  return (p?.name || '').trim().toLowerCase() === PROJECTS_PIPELINE_NAME.toLowerCase();
}

export function isProjectsPipelineId(
  pipelines: PipelineLike[] | null | undefined,
  pipelineId: string | null | undefined
): boolean {
  if (!pipelineId || !pipelines) return false;
  const p = pipelines.find(x => x.id === pipelineId);
  return isProjectsPipeline(p);
}

/** True when a deal belongs to a Projects pipeline (metrics-excluded). */
export function isProjectsDeal(
  deal: { pipelineId?: string | null; pipelineName?: string | null } | null | undefined,
  pipelines?: PipelineLike[] | null
): boolean {
  if (!deal) return false;
  if (isProjectsPipeline({ name: deal.pipelineName ?? null })) return true;
  return isProjectsPipelineId(pipelines ?? null, deal.pipelineId ?? null);
}