import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "list_lender_contacts",
  title: "List funding source contacts",
  description: "Read-only. List every row in a funding source's multi-contact list (lender_contacts) with its row id (use as contact_id in upsert_lender_contact / delete_lender_contact), name, title, email, phone, location, notes, is_primary and linked CRM contact id.",
  inputSchema: { lender_id: z.string().uuid() },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ lender_id }, ctx) => {
    const denied = requireAuth(ctx);
    if (denied) return denied;
    const sb = supabaseForUser(ctx);
    const { data: lender, error: lErr } = await sb.from("master_lenders").select("id, name").eq("id", lender_id).maybeSingle();
    if (lErr) return errorResult(lErr.message);
    if (!lender) return errorResult("Funding source not found (or not visible to you).");
    const { data, error } = await sb.from("lender_contacts")
      .select("id, name, title, email, phone, city, state, country, geography, notes, is_primary, contact_id, created_at, updated_at")
      .eq("lender_id", lender_id).order("is_primary", { ascending: false }).order("name").limit(500);
    if (error) return errorResult(error.message);
    const contacts = ((data ?? []) as Array<Record<string, unknown>>).map(({ contact_id, ...r }) => ({ ...r, crm_contact_id: contact_id }));
    return textResult({ lender_id, lender_name: lender.name, count: contacts.length, contacts }, { lender_id, count: contacts.length });
  },
});
