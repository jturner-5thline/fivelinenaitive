import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { findIdempotent, idempotencyKey, introPathProblems, isUniqueViolation, loadLender, logWrite } from "../lenderRelationshipData";

const TOOL = "add_lender_intro_path";
export default defineTool({
  name: TOOL,
  title: "Add an intro path to a funding source",
  description: "Insert one lender_intro_paths row: who connected us to the funding source (or one of its lender_contacts). Requires lender_id, path_type, evidence_type, evidence_ref (unless evidence_type is manual) and one of from_contact_id, from_user_id, from_referral_source_id or from_name. Saved as proposed unless status is given; a duplicate returns the existing row with created:false. Writes only lender_intro_paths plus an audit entry.",
  inputSchema: {
    lender_id: z.string().uuid(),
    lender_contact_id: z.string().uuid().optional().describe("lender_contacts.id the intro led to"),
    from_contact_id: z.string().uuid().optional().describe("CRM contacts.id of the introducer"),
    from_user_id: z.string().uuid().optional().describe("naitive user id (5LCA teammate)"),
    from_referral_source_id: z.string().uuid().optional(),
    from_name: z.string().trim().max(200).optional().describe("Use when no id applies"),
    path_type: z.enum(["introduced_by", "referred_by", "former_colleague", "mutual_connection", "met_at_event", "other"]),
    evidence_type: z.enum(["intro_email", "calendar", "linkedin", "referral_source", "manual"]),
    evidence_ref: z.string().trim().max(1000).optional(),
    occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    notes: z.string().max(5000).optional(),
    status: z.enum(["proposed", "confirmed"]).default("proposed"),
    ...idempotencyKey,
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    const authErr = requireAuth(ctx); if (authErr) return authErr;
    const problems = introPathProblems(input); if (problems.length) return errorResult(problems.join("; "));
    const sb = supabaseForUser(ctx);
    const prior = await findIdempotent(sb, TOOL, input.idempotency_key);
    if (prior) return textResult({ id: prior.target_id, created: false, replayed: true, intro_path: prior.after }, { id: prior.target_id, created: false });
    const l = await loadLender(sb, input.lender_id); if ("error" in l) return errorResult(l.error!);
    if (input.lender_contact_id) {
      const { data: lc } = await sb.from("lender_contacts").select("id").eq("id", input.lender_contact_id).eq("lender_id", input.lender_id).maybeSingle();
      if (!lc) return errorResult("lender_contact_id does not belong to this funding source.");
    }
    const { idempotency_key, ...row } = input;
    const ins = await sb.from("lender_intro_paths").insert({ ...row, created_by: ctx.getUserId() }).select("*").single();
    if (ins.error && !isUniqueViolation(ins.error)) return errorResult(ins.error.message);
    if (ins.error) {
      let q = sb.from("lender_intro_paths").select("*").eq("lender_id", input.lender_id).eq("path_type", input.path_type);
      q = input.lender_contact_id ? q.eq("lender_contact_id", input.lender_contact_id) : q.is("lender_contact_id", null);
      const { data } = await q;
      const from = input.from_contact_id ?? input.from_user_id ?? input.from_referral_source_id ?? input.from_name?.trim().toLowerCase();
      const hit = (data ?? []).find((r) => [r.from_contact_id, r.from_user_id, r.from_referral_source_id, r.from_name?.toLowerCase()].includes(from));
      return textResult({ id: hit?.id ?? null, created: false, intro_path: hit ?? null }, { id: hit?.id ?? null, created: false });
    }
    const warn = await logWrite(sb, { tool: TOOL, idempotency_key, target_table: "lender_intro_paths", target_id: ins.data.id, lender_id: input.lender_id, action: "created", after: ins.data });
    return textResult({ id: ins.data.id, created: true, intro_path: ins.data, audit_warning: warn }, { id: ins.data.id, created: true });
  },
});
