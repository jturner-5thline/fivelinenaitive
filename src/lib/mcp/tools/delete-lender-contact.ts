import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { logLenderAudit } from "../lenderWrites";

const CONTACT_FIELDS = ["name", "title", "email", "phone", "city", "state", "country", "geography", "notes", "is_primary"];

export default defineTool({
  name: "delete_lender_contact",
  title: "Delete a funding source contact",
  description:
    "Permanently remove one contact from a funding source's multi-contact list (`lender_contacts`), e.g. a duplicate or wrong entry. Requires `confirm: true`. Logged to `lender_audit_logs`. Deleting the primary contact leaves the lender with no primary; promote another with `upsert_lender_contact` (is_primary: true) — there is never more than one primary.",
  inputSchema: {
    contact_id: z.string().uuid(),
    confirm: z.literal(true).describe("Must be true to confirm the permanent deletion."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ contact_id }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    const { data: before, error } = await sb.from("lender_contacts").select("*").eq("id", contact_id).maybeSingle();
    if (error) return errorResult(error.message);
    if (!before) return errorResult("contact_id: contact not found (or not visible to this user).");

    const { data: deleted, error: delErr } = await sb.from("lender_contacts").delete().eq("id", contact_id).select("id");
    if (delErr) return errorResult(delErr.message);
    if (!deleted?.length) return errorResult("Delete was blocked by permissions.");

    const lenderId = before.lender_id as string;
    const after = Object.fromEntries(CONTACT_FIELDS.map((f) => [f, null]));
    await logLenderAudit(sb, ctx, lenderId, "contact_deleted", before, after, CONTACT_FIELDS, {
      via: "mcp:delete_lender_contact",
      contact_id,
      contact_name: before.name ?? null,
    });

    const { data: remaining } = await sb.from("lender_contacts").select("id, name, is_primary").eq("lender_id", lenderId);
    const rem = (remaining ?? []) as Array<{ is_primary: boolean | null }>;
    return textResult(
      { deleted: true, contact: before, remaining_contacts: rem, has_primary: rem.some((r) => r.is_primary) },
      { contact_id, lender_id: lenderId, deleted: true },
    );
  },
});
