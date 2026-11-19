import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { findIdempotent, idempotencyKey, introPathProblems, logWrite } from "../lenderRelationshipData";

const TOOL = "update_lender_intro_path";
export default defineTool({
  name: TOOL,
  title: "Update, confirm or reject an intro path",
  description: "Edit one lender_intro_paths row by id (status confirmed/rejected, path_type, evidence, date, notes). The result must still have a from value and evidence. Writes only that row plus an audit entry.",
  inputSchema: {
    id: z.string().uuid(),
    status: z.enum(["proposed", "confirmed", "rejected"]).optional(),
    path_type: z.enum(["introduced_by", "referred_by", "former_colleague", "mutual_connection", "met_at_event", "other"]).optional(),
    evidence_type: z.enum(["intro_email", "calendar", "linkedin", "referral_source", "manual"]).optional(),
    evidence_ref: z.string().trim().max(1000).nullable().optional(),
    occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
    ...idempotencyKey,
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    const authErr = requireAuth(ctx); if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    const prior = await findIdempotent(sb, TOOL, input.idempotency_key);
    if (prior) return textResult({ id: prior.target_id, replayed: true, intro_path: prior.after }, { id: prior.target_id });
    const { id, idempotency_key, ...rest } = input;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
    if (!Object.keys(patch).length) return errorResult("Nothing to update.");
    const { data: before, error: bErr } = await sb.from("lender_intro_paths").select("*").eq("id", id).maybeSingle();
    if (bErr) return errorResult(bErr.message);
    if (!before) return errorResult("Intro path not found (or not visible to this user).");
    const problems = introPathProblems({ ...before, ...patch }); if (problems.length) return errorResult(problems.join("; "));
    const { data, error } = await sb.from("lender_intro_paths").update(patch).eq("id", id).select("*").maybeSingle();
    if (error) return errorResult(error.code === "23505" ? "An identical intro path already exists." : error.message);
    if (!data) return errorResult("Update not permitted for this user.");
    const warn = await logWrite(sb, { tool: TOOL, idempotency_key, target_table: "lender_intro_paths", target_id: id, lender_id: before.lender_id, action: patch.status ? `status:${patch.status}` : "updated", before, after: data });
    return textResult({ id, intro_path: data, audit_warning: warn }, { id, status: data.status });
  },
});
