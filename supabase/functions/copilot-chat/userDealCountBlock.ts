// Pure helper that builds the "USER DEAL COUNT AUTHORITY" prompt block
// injected into the copilot system prompt for "how many deals does <name>
// manage/own" questions. Extracted so it can be unit-tested independently
// of the live edge-function DB call.
//
// Contract (see index.ts for the enforcement rule):
// - Always states Active=<n> and Closed=<n> exactly.
// - Always discloses the active-pipeline filter.
// - ALWAYS lists closed deal names when closedCount > 0, EVEN WHEN
//   activeCount === 0. The user complaint we're guarding against is a
//   Copilot reply that says "Niki manages 0 active deals" and stops
//   there, hiding the fact that Niki also owns several closed deals.

export interface DealRow {
  id: string;
  company: string | null;
  stage?: string | null;
}

export function formatDealList(arr: DealRow[]): string {
  if (!arr.length) return "(none)";
  return arr
    .map((d) => `[${d.company}](entity://deal/${d.id})${d.stage ? ` — ${d.stage}` : ""}`)
    .join(", ");
}

export function buildUserDealCountBlock(
  rawName: string,
  active: DealRow[],
  closed: DealRow[],
): string {
  const activeCount = active.length;
  const closedCount = closed.length;
  const totalCount = activeCount + closedCount;
  return `\n\nUSER DEAL COUNT AUTHORITY — deterministic query result for "${rawName}" (managed = manager OR owner, matched on manager, deal_owner, and deal_owner_user_id; globally excluded test deals removed):\n- Active-pipeline stages: ${activeCount}\n- Closed stages (closed-won, closed-lost, on-hold, archived): ${closedCount}\n- Total managed: ${totalCount}\n- Active deal names: ${formatDealList(active)}\n- Closed deal names: ${formatDealList(closed)}\n- These are the ONLY correct figures for this question. You MUST state Active=${activeCount} and Closed=${closedCount} exactly, disclose the filter ("counting only active-pipeline stages") when quoting the active count, and ALWAYS include the closed-stage breakdown with deal names — even when the active count is 0. Do NOT call search_deals, get_pipeline_snapshot, or any counting tool to re-derive these figures. Do NOT emit any other count in the same reply.`;
}