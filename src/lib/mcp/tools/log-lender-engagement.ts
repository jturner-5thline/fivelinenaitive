import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { findIdempotent, idempotencyKey, isUniqueViolation, loadLender, logWrite } from "../lenderRelationshipData";

const TOOL = "log_lender_engagement";
export default defineTool({
  name: TOOL,
  title: "Log a funding source engagement",
  description: "Upsert one row in lender_engagements keyed by (source, external_ref, lender_id); requires lender_id, activity_type, occurred_at, source and external_ref. The workspace and CRM company are filled from the funding source when omitted. Returns the row id and created|updated. Writes only lender_engagements plus an audit entry.",
  inputSchema: {
    lender_id: z.string().uuid().describe("master_lenders.id"),
    contact_id: z.string().uuid().optional().describe("CRM contacts.id; set it to show the engagement on that contact's page."),
    crm_company_id: z.string().uuid().optional().describe("Defaults to the funding source's CRM company."),
    deal_id: z.string().uuid().optional(),
    activity_type: z.string().trim().min(1).max(50).describe("e.g. email, call, meeting, note"),
    subject: z.string().max(500).optional(),
    body: z.string().max(20000).optional(),
    direction: z.enum(["inbound", "outbound", "internal"]).optional(),
    occurred_at: z.string().datetime({ offset: true }).describe("ISO timestamp"),
    source: z.string().trim().min(1).max(50).describe("e.g. gmail, claap, calendar, manual"),
    external_ref: z.string().trim().min(1).max(500).describe("Stable id in the source (Gmail message id, Claap id, URL)."),
    metadata: z.record(z.unknown()).optional(),
    ...idempotencyKey,
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    const authErr = requireAuth(ctx); if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    const prior = await findIdempotent(sb, TOOL, input.idempotency_key);
    if (prior) return textResult({ id: prior.target_id, result: prior.action, replayed: true }, { id: prior.target_id, result: prior.action });
    const l = await loadLender(sb, input.lender_id); if ("error" in l) return errorResult(l.error!);
    const { idempotency_key, ...fields } = input;
    const row: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) if (v !== undefined) row[k] = v;
    const find = () => sb.from("lender_engagements").select("*").eq("lender_id", input.lender_id).eq("source", input.source).eq("external_ref", input.external_ref).maybeSingle();
    let { data: existing, error } = await find();
    if (error) return errorResult(error.message);
    let action = "updated"; let saved: Record<string, unknown> | null = null;
    if (!existing) {
      const ins = await sb.from("lender_engagements").insert(row).select("*").single();
      if (ins.error && !isUniqueViolation(ins.error)) return errorResult(ins.error.message);
      if (!ins.error) { action = "created"; saved = ins.data; } else { ({ data: existing } = await find()); }
    }
    if (!saved) {
      const { lender_id: _l, source: _s, external_ref: _e, ...patch } = row;
      const up = await sb.from("lender_engagements").update(patch).eq("id", existing!.id).select("*").maybeSingle();
      if (up.error) return errorResult(up.error.message);
      if (!up.data) return errorResult("An engagement with this source/external_ref exists but only its author can update it.");
      saved = up.data;
    }
    const warn = await logWrite(sb, { tool: TOOL, idempotency_key, target_table: "lender_engagements", target_id: saved!.id as string, lender_id: input.lender_id, action, before: existing ?? null, after: saved });
    return textResult({ id: saved!.id, result: action, engagement: saved, audit_warning: warn }, { id: saved!.id as string, result: action });
  },
});
