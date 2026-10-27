/**
 * A referred deal only counts toward Referral Source tiers once it ENTERS
 * "NDA / Needs List Sent" on the Active Pipeline. Its tier date is that entry
 * date — not deals.created_at (the CRM import timestamp).
 */
import { REACHED_NDA_STAGES } from "../components/channels/atRiskSources";

export const NDA_STAGE_ID = "ndaneeds-list-sent";

export interface NdaHistoryRow {
  deal_id: string;
  changed_at: string | null;
  pipeline_id: string | null;
}

/** Earliest NDA stage_enter per deal on an Active pipeline. */
export function earliestNdaEntries(rows: NdaHistoryRow[], activePipelineIds: Set<string>, dealPipeline: Map<string, string | null>): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of rows) {
    if (!r.changed_at) continue;
    const pid = r.pipeline_id ?? dealPipeline.get(r.deal_id) ?? null;
    if (!pid || !activePipelineIds.has(pid)) continue;
    const prev = out.get(r.deal_id);
    if (!prev || r.changed_at < prev) out.set(r.deal_id, r.changed_at);
  }
  return out;
}

/**
 * NDA entry date for a deal: the recorded stage_enter when present; otherwise,
 * for Active-pipeline deals already at/past NDA with no history (imported
 * before tracking), created_at. Null when the deal never reached NDA.
 */
export function resolveNdaEnteredAt(
  deal: { id: string; stage: string | null; created_at: string; pipeline_id: string | null },
  entries: Map<string, string>,
  activePipelineIds: Set<string>,
): string | null {
  const hit = entries.get(deal.id);
  if (hit) return hit;
  if (deal.pipeline_id && activePipelineIds.has(deal.pipeline_id) && deal.stage && REACHED_NDA_STAGES.has(deal.stage)) {
    return deal.created_at;
  }
  return null;
}
