import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { dealHistoryProblems, findIdempotent, idempotencyKey, isUniqueViolation, loadLender, logWrite } from "../lenderRelationshipData";

const TOOL = "add_lender_deal_history";
export default defineTool({
  name: TOOL,
  title: "Log an outside deal for a funding source",
  description: "Insert one lender_deal_history row (a deal the funding source did outside 5LCA). Requires lender_id, borrower_name, source_type, source_ref and evidence_grade. Saved as proposed unless status is given. A duplicate (same lender, borrower and month) returns the existing row with created:false. Writes only lender_deal_history plus an audit entry.",
  inputSchema: {
    lender_id: z.string().uuid(),
    borrower_name: z.string().trim().min(1).max(300),
    announced_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("YYYY-MM-DD"),
    amount_usd: z.number().nonnegative().optional(), amount_text: z.string().max(100).optional().describe("Ranges like \$10-15MM"),
    product_type: z.string().max(200).optional(), industry: z.string().max(200).optional(), geography: z.string().max(200).optional(),
    lender_role: z.enum(["lead", "participant", "agent", "sole", "unknown"]).optional(),
    source_type: z.enum(["lender_email", "press_release", "lender_site", "news", "other"]),
    source_ref: z.string().trim().min(1).max(1000).describe("Gmail message id or URL"),
    evidence_grade: z.enum(["lender_announced", "third_party", "inferred"]),
    status: z.enum(["proposed", "confirmed"]).default("proposed"),
    proposed_by: z.string().max(100).default("mcp"),
    ...idempotencyKey,
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    const authErr = requireAuth(ctx); if (authErr) return authErr;
    const problems = dealHistoryProblems(input); if (problems.length) return errorResult(problems.join("; "));
    const sb = supabaseForUser(ctx);
    const prior = await findIdempotent(sb, TOOL, input.idempotency_key);
    if (prior) return textResult({ id: prior.target_id, created: false, replayed: true, deal: prior.after }, { id: prior.target_id, created: false });
    const l = await loadLender(sb, input.lender_id); if ("error" in l) return errorResult(l.error!);
    const { idempotency_key, ...row } = input;
    const ins = await sb.from("lender_deal_history").insert({ ...row, created_by: ctx.getUserId() }).select("*").single();
    if (ins.error && !isUniqueViolation(ins.error)) return errorResult(ins.error.message);
    if (ins.error) {
      const month = input.announced_on ? input.announced_on.slice(0, 7) : "";
      const key = `${input.lender_id}|${input.borrower_name.trim()}|${month}`.toLowerCase();
      const { data } = await sb.from("lender_deal_history").select("*").eq("dedupe_key", key).maybeSingle();
      return textResult({ id: data?.id ?? null, created: false, deal: data }, { id: data?.id ?? null, created: false });
    }
    const warn = await logWrite(sb, { tool: TOOL, idempotency_key, target_table: "lender_deal_history", target_id: ins.data.id, lender_id: input.lender_id, action: "created", after: ins.data });
    return textResult({ id: ins.data.id, created: true, deal: ins.data, audit_warning: warn }, { id: ins.data.id, created: true });
  },
});
