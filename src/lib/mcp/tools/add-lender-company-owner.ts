import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { findIdempotent, idempotencyKey, loadLender, logWrite } from "../lenderRelationshipData";

const TOOL = "add_lender_company_owner";
export default defineTool({
  name: TOOL,
  title: "Add an owner to a funding source's company",
  description: "Insert one crm_company_team row for the funding source's linked CRM company. Requires lender_id and user_id (a member of the funding source's workspace); role defaults to owner. If that user is already on the team, returns the existing row with created:false. Never writes contacts.owner_user_id or relationship_owners.",
  inputSchema: {
    lender_id: z.string().uuid(),
    user_id: z.string().uuid().describe("naitive user id of the owner"),
    role: z.string().trim().min(1).max(100).default("owner"),
    ...idempotencyKey,
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    const authErr = requireAuth(ctx); if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    const prior = await findIdempotent(sb, TOOL, input.idempotency_key);
    if (prior) return textResult({ id: prior.target_id, created: false, replayed: true, owner: prior.after }, { id: prior.target_id, created: false });
    const l = await loadLender(sb, input.lender_id); if ("error" in l) return errorResult(l.error!);
    if (!l.lender.crm_company_id) return errorResult("This funding source is not linked to a CRM company, so it has no company owners.");
    if (!l.lender.company_id) return errorResult("This funding source has no workspace.");
    const { data: member } = await sb.from("company_members").select("user_id").eq("company_id", l.lender.company_id).eq("user_id", input.user_id).maybeSingle();
    if (!member) return errorResult("user_id is not a member of this funding source's workspace.");
    const { data: existing } = await sb.from("crm_company_team").select("*").eq("crm_company_id", l.lender.crm_company_id).eq("user_id", input.user_id).maybeSingle();
    if (existing) return textResult({ id: existing.id, created: false, owner: existing }, { id: existing.id, created: false });
    const { data, error } = await sb.from("crm_company_team").insert({ crm_company_id: l.lender.crm_company_id, user_id: input.user_id, role: input.role }).select("*").single();
    if (error) return errorResult(error.message);
    const warn = await logWrite(sb, { tool: TOOL, idempotency_key: input.idempotency_key, target_table: "crm_company_team", target_id: data.id, lender_id: input.lender_id, action: "created", after: data });
    return textResult({ id: data.id, created: true, owner: data, audit_warning: warn }, { id: data.id, created: true });
  },
});
