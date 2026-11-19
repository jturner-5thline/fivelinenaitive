import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { findIdempotent, idempotencyKey, logWrite } from "../lenderRelationshipData";

const TOOL = "update_lender_deal_history";
export default defineTool({
  name: TOOL,
  title: "Update, confirm or reject an outside deal",
  description: "Edit one lender_deal_history row by id. Set status to confirmed or rejected to review a proposed deal (confirmed_by/confirmed_at are stamped automatically). Writes only that row plus an audit entry.",
  inputSchema: {
    id: z.string().uuid(),
    status: z.enum(["proposed", "confirmed", "rejected"]).optional(),
    borrower_name: z.string().trim().min(1).max(300).optional(),
    announced_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    amount_usd: z.number().nonnegative().nullable().optional(), amount_text: z.string().max(100).nullable().optional(),
    product_type: z.string().max(200).nullable().optional(), industry: z.string().max(200).nullable().optional(), geography: z.string().max(200).nullable().optional(),
    lender_role: z.enum(["lead", "participant", "agent", "sole", "unknown"]).optional(),
    source_type: z.enum(["lender_email", "press_release", "lender_site", "news", "other"]).optional(),
    source_ref: z.string().trim().min(1).max(1000).optional(),
    evidence_grade: z.enum(["lender_announced", "third_party", "inferred"]).optional(),
    ...idempotencyKey,
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    const authErr = requireAuth(ctx); if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    const prior = await findIdempotent(sb, TOOL, input.idempotency_key);
    if (prior) return textResult({ id: prior.target_id, replayed: true, deal: prior.after }, { id: prior.target_id });
    const { id, idempotency_key, ...rest } = input;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
    if (!Object.keys(patch).length) return errorResult("Nothing to update.");
    const { data: before, error: bErr } = await sb.from("lender_deal_history").select("*").eq("id", id).maybeSingle();
    if (bErr) return errorResult(bErr.message);
    if (!before) return errorResult("Outside deal not found (or not visible to this user).");
    const { data, error } = await sb.from("lender_deal_history").update(patch).eq("id", id).select("*").maybeSingle();
    if (error) return errorResult(error.code === "23505" ? "Another outside deal already exists for this lender, borrower and month." : error.message);
    if (!data) return errorResult("Update not permitted for this user.");
    const warn = await logWrite(sb, { tool: TOOL, idempotency_key, target_table: "lender_deal_history", target_id: id, lender_id: before.lender_id, action: patch.status ? `status:${patch.status}` : "updated", before, after: data });
    return textResult({ id, deal: data, audit_warning: warn }, { id, status: data.status });
  },
});
