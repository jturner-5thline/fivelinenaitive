import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { LENDER_RELATED_FIELDS, type LenderRelatedTable } from "./lenderRelatedFields";
import { supabaseForUser, requireAuth, textResult, errorResult } from "./supabase";

export const writeProvenance = {
  source: z.string().max(1000).optional(),
  change_reason: z.string().max(2000).optional(),
};

export async function writeLenderRelated(
  sb: ReturnType<typeof supabaseForUser>, table: string, action: string, lenderId: string,
  recordId: string | undefined, patch: Record<string, unknown>, confirm?: boolean, source?: string, reason?: string,
) {
  const { data, error } = await sb.rpc("mcp_write_lender_related", {
    p_table: table, p_action: action, p_lender_id: lenderId, p_record_id: recordId ?? null,
    p_patch: Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
    p_confirm: confirm ?? false, p_source: source ?? null, p_change_reason: reason ?? null,
  });
  if (error) return errorResult(`${table} ${action}: ${error.message}`);
  return textResult(data);
}

export function defineLenderRelatedTool(table: LenderRelatedTable, action: "create" | "update" | "delete", name: string) {
  const fields = LENDER_RELATED_FIELDS[table];
  return defineTool({
    name, title: `${action} ${table.replace(/_/g, " ")}`,
    description: `${action} a ${table} record, acting as the caller under existing RLS. Writable fields: ${Object.keys(fields).join(", ")}. Does not write identity, company/tenant, author/reviewer, lender ownership, timestamps or computed fields. lender_id scopes the record; server derives ownership and actor. Every changed field is audited transactionally in lender_audit_logs with source/change_reason. Existing author/admin-only restrictions remain; insufficient permissions return errors. Deletes require confirm:true; missing rows never silently succeed. No FLEx calls.`,
    inputSchema: {
      lender_id: z.string().uuid(),
      record_id: action === "create" ? z.string().uuid().optional().describe("Not used on creation; IDs are generated.") : z.string().uuid(),
      ...(action === "delete" ? { confirm: z.literal(true) } : fields),
      ...writeProvenance,
    },
    annotations: { readOnlyHint: false, destructiveHint: action === "delete", idempotentHint: false, openWorldHint: false },
    handler: async (input, ctx) => {
      const authErr = requireAuth(ctx);
      if (authErr) return authErr;
      const { lender_id, record_id, source, change_reason, confirm, ...patch } = input as Record<string, unknown> & { lender_id: string; record_id?: string; source?: string; change_reason?: string; confirm?: boolean };
      return writeLenderRelated(supabaseForUser(ctx), table, action, lender_id, record_id, patch, confirm, source, change_reason);
    },
  });
}