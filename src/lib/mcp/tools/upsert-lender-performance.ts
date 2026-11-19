import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

const dimension = z.object({
  score: z.number().min(0).max(100).nullable().describe("0-100, or null when not enough data."),
  driver: z.string().max(1000).nullable().optional().describe("Short reason behind the score."),
}).strict();
const scoreInput = z.object({
  lender_id: z.string().uuid(),
  computed_at: z.string().optional().describe("ISO date-time; defaults to now."),
  window_days: z.number().int().min(1).max(3650).optional(),
  dimensions: z.record(z.string().min(1).max(80), dimension),
  overall_label: z.enum(["strong", "mixed", "weak"]),
  version: z.string().max(50).optional(),
}).strict();

export default defineTool({
  name: "upsert_lender_performance",
  title: "Save funding-source performance scores",
  description: "Writes lender_performance_scores (one current row per lender, replaced) and appends a lender_performance_history row, in one transaction per lender. Pass `scores` with 1-50 items; each needs lender_id, dimensions {name: {score 0-100|null, driver}} and overall_label (strong|mixed|weak).",
  inputSchema: { scores: z.array(scoreInput).min(1).max(50) },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (i, ctx) => {
    const authErr = requireAuth(ctx); if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    const results: Array<{ lender_id: string; ok: boolean; action?: string; score_id?: string; history_id?: string; error?: string }> = [];
    for (const s of i.scores) {
      if (s.computed_at && Number.isNaN(Date.parse(s.computed_at))) { results.push({ lender_id: s.lender_id, ok: false, error: "computed_at must be ISO" }); continue; }
      const dims = Object.fromEntries(Object.entries(s.dimensions).map(([k, v]) => [k, { score: v.score, driver: v.driver ?? null }]));
      const { data, error } = await sb.rpc("upsert_lender_performance", {
        _lender_id: s.lender_id, _computed_at: s.computed_at ?? new Date().toISOString(), _window_days: s.window_days ?? null,
        _dimensions: dims, _overall_label: s.overall_label, _version: s.version ?? null,
      } as never);
      if (error) { results.push({ lender_id: s.lender_id, ok: false, error: error.message }); continue; }
      const r = (data ?? {}) as { action?: string; score_id?: string; history_id?: string };
      results.push({ lender_id: s.lender_id, ok: true, action: r.action, score_id: r.score_id, history_id: r.history_id });
    }
    const failed = results.filter((r) => !r.ok).length;
    if (failed === results.length) return errorResult(`All ${failed} writes failed: ${results.map((r) => r.error).join("; ")}`);
    return textResult({ results, written: results.length - failed, failed }, { written: results.length - failed, failed });
  },
});
