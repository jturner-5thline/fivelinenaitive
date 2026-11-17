import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { isExcludedDealName } from "../insights";
import { finservSnapshotAt, type StageHistoryRow } from "../../finservActiveAt";

const FINSERV_PIPELINE_ID = "6907be5e-b17c-4a95-a7c2-fd977c94e179";

function periodEnds(from: string, to: string, g: "monthly" | "quarterly" | "yearly") {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const step = g === "monthly" ? 1 : g === "quarterly" ? 3 : 12;
  const out: Array<{ label: string; end: Date }> = [];
  let y = fy, m = fm;
  if (g === "quarterly") m = Math.floor((m - 1) / 3) * 3 + 1;
  if (g === "yearly") m = 1;
  while (y < ty || (y === ty && m <= tm)) {
    const endM = m + step - 1; // 1-based last month of bucket
    const end = new Date(y, endM, 0, 23, 59, 59);
    const label = g === "monthly" ? `${y}-${String(m).padStart(2, "0")}` : g === "quarterly" ? `${y}-Q${(m + 2) / 3}` : `${y}`;
    out.push({ label, end });
    m += step;
    while (m > 12) { m -= 12; y += 1; }
    if (out.length > 120) break;
  }
  return out;
}

export default defineTool({
  name: "get_finserv_client_metrics",
  title: "Get FinServ active clients and MRR by period",
  description:
    "Point-in-time FinServ Active Clients and Total MRR at the end of each month/quarter/year, exactly as the FinServ Financial Metrics dashboard and Insights tiles show them. Before May 2026 a client counts if it was in Active Client at period end OR its contract start date was on/before period end and it had not exited Active Client; from May 2026 only the Active Client stage counts. MRR = open (non-churned/lost/in-development) deals plus clients counted active. June 2026 uses the dashboard's manual 7-client correction.",
  inputSchema: {
    from_month: z.string().regex(/^\d{4}-\d{2}$/).describe("First month YYYY-MM."),
    to_month: z.string().regex(/^\d{4}-\d{2}$/).describe("Last month YYYY-MM inclusive."),
    granularity: z.enum(["monthly", "quarterly", "yearly"]).default("quarterly"),
    include_clients: z.boolean().default(false).describe("List the clients counted active in each period."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from_month, to_month, granularity, include_clients }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    const { data: deals, error } = await sb
      .from("deals")
      .select("id, company, crm_company_id, stage, mrr, created_at, contract_start_date, contract_end_date, stage_entered_at")
      .eq("pipeline_id", FINSERV_PIPELINE_ID);
    if (error) return errorResult(error.message);
    const { data: hist, error: he } = await sb
      .from("deal_stage_history")
      .select("deal_id, to_stage, changed_at")
      .eq("pipeline_id", FINSERV_PIPELINE_ID)
      .order("changed_at", { ascending: true });
    if (he) return errorResult(he.message);
    const historyByDeal = new Map<string, StageHistoryRow[]>();
    for (const h of hist ?? []) {
      const arr = historyByDeal.get(h.deal_id) ?? [];
      arr.push({ to_stage: h.to_stage, changed_at: h.changed_at });
      historyByDeal.set(h.deal_id, arr);
    }
    const kept = (deals ?? []).filter((d) => !isExcludedDealName(d.company));
    const now = new Date();
    const periods = periodEnds(from_month, to_month, granularity).map(({ label, end }) => {
      const eff = end > now ? now : end;
      const s = finservSnapshotAt(kept, historyByDeal, eff);
      return {
        period: label,
        as_of: eff.toISOString(),
        active_clients: s.active_clients,
        active_engagements: s.active_engagements,
        total_mrr: s.total_mrr,
        ...(include_clients ? { clients: s.clients } : {}),
      };
    });
    const payload = { granularity, periods };
    return textResult(payload, payload);
  },
});
