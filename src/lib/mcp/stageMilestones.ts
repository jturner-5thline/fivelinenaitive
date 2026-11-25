import { getStageMilestones, type NaitiveMilestoneDef } from "@/config/naitiveStageMilestones";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PipelineStage { id: string; label?: string; systemStageType?: string }

/** Stage milestone definitions for a stage, using the app's seeded config (same lookup as the UI). */
export function stageMilestoneDefs(stageId: string, stages: PipelineStage[]): NaitiveMilestoneDef[] {
  const stage = stages.find((s) => s.id === stageId);
  return getStageMilestones(stage ? { id: stage.id, label: stage.label, systemStageType: stage.systemStageType } : stageId);
}

export interface StageMilestoneRow { id: string; stage: string; milestone_key: string; completed: boolean; completed_at: string | null; updated_at: string }

/** Merge defined milestones with stored rows; undefined stored rows are kept and flagged. */
export function mergeStageMilestones(stageId: string, defs: NaitiveMilestoneDef[], rows: StageMilestoneRow[]) {
  const stageRows = rows.filter((r) => r.stage === stageId);
  const defined = defs.map((d) => {
    const r = stageRows.find((x) => x.milestone_key === d.key);
    return { id: r?.id ?? null, stage: stageId, milestone_key: d.key, label: d.label, position: d.position, completed: r?.completed ?? false, completed_at: r?.completed_at ?? null, updated_at: r?.updated_at ?? null, defined: true, has_row: !!r };
  });
  const extra = stageRows.filter((r) => !defs.some((d) => d.key === r.milestone_key)).map((r) => ({
    id: r.id, stage: stageId, milestone_key: r.milestone_key, label: r.milestone_key, position: null, completed: r.completed, completed_at: r.completed_at, updated_at: r.updated_at, defined: false, has_row: true,
  }));
  return [...defined, ...extra];
}

export async function loadDealWithStages(sb: SupabaseClient, dealId: string) {
  const { data: deal, error } = await sb.from("deals").select("id, company, stage, pipeline_id").eq("id", dealId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!deal) throw new Error("Deal not found or not accessible");
  let stages: PipelineStage[] = [];
  if (deal.pipeline_id) {
    const { data: p } = await sb.from("deal_pipelines").select("stages").eq("id", deal.pipeline_id).maybeSingle();
    if (Array.isArray(p?.stages)) stages = p.stages as unknown as PipelineStage[];
  }
  return { deal, stages };
}
