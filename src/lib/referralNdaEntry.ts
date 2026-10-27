/**
 * A referred deal only counts toward Referral Source tiers once it ENTERS
 * "NDA / Needs List Sent" on the Active Pipeline. Its tier date is that entry
 * date. When no NDA entry is recorded, the entry into the closest later Active
 * stage is used instead. deals.created_at (the CRM import timestamp) is NEVER
 * used as a referral date.
 */
import { REACHED_NDA_STAGES } from "../components/channels/atRiskSources";

export const NDA_STAGE_ID = "ndaneeds-list-sent";

/** Active-pipeline stages from NDA onward, in pipeline order (closest first). */
export const NDA_ONWARD_STAGE_ORDER = [...REACHED_NDA_STAGES];

export interface NdaHistoryRow {
  deal_id: string;
  changed_at: string | null;
  pipeline_id: string | null;
  to_stage_id?: string | null;
  to_stage?: string | null;
}

/**
 * Per deal on an Active pipeline: the earliest entry into NDA / Needs List
 * Sent; if none, the earliest entry into the closest later stage.
 * Rows without a stage are treated as NDA entries.
 */
export function earliestNdaEntries(rows: NdaHistoryRow[], activePipelineIds: Set<string>, dealPipeline: Map<string, string | null>): Map<string, string> {
  const best = new Map<string, { rank: number; at: string }>();
  for (const r of rows) {
    if (!r.changed_at) continue;
    const pid = r.pipeline_id ?? dealPipeline.get(r.deal_id) ?? null;
    if (!pid || !activePipelineIds.has(pid)) continue;
    const stage = r.to_stage_id ?? r.to_stage ?? NDA_STAGE_ID;
    const rank = NDA_ONWARD_STAGE_ORDER.indexOf(stage);
    if (rank < 0) continue;
    const prev = best.get(r.deal_id);
    if (!prev || rank < prev.rank || (rank === prev.rank && r.changed_at < prev.at)) {
      best.set(r.deal_id, { rank, at: r.changed_at });
    }
  }
  return new Map([...best].map(([id, v]) => [id, v.at]));
}

/** Referral date for a deal from recorded stage history only; null when none exists. */
export function resolveNdaEnteredAt(
  deal: { id: string },
  entries: Map<string, string>,
  _activePipelineIds?: Set<string>,
): string | null {
  return entries.get(deal.id) ?? null;
}
