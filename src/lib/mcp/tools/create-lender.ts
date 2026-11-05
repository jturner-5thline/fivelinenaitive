import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { LENDER_FIELD_SCHEMA, validateLenderPatch } from "../lenderFields";
import { writeProvenance } from "../lenderRelatedWrites";

export default defineTool({
  name: "create_lender",
  title: "Create funding source / lender",
  description:
    "Create a NEW funding source (lender) in the master directory (`master_lenders`). Use only when the lender does not exist yet — to change an existing one use `update_lender`. Requires `name`; accepts every field `update_lender` accepts. Rejects the request and returns the candidate ids when a lender with the same name (case-insensitive, trimmed) already exists. Applies the same defaults as the app (owner = you, your company, active = true, appetite_status = 'active', sync_source = 'naitive', no tier), writes a 'created' entry per set field to `lender_audit_logs`, and returns the full new record. Contacts go in `upsert_lender_contact` afterwards.",
  inputSchema: {
    name: z.string().trim().min(1).max(200).describe("Name of the new funding source."),
    ...LENDER_FIELD_SCHEMA,
    ...writeProvenance,
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const { name, source, change_reason, ...rest } = input;
    const cleanName = name.trim();

    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) if (v !== undefined) fields[k] = v;

    const sb = supabaseForUser(ctx);
    const invalid = await validateLenderPatch(sb, fields);
    if (invalid) return errorResult(invalid);

    const escaped = cleanName.replace(/[\\%_]/g, (c) => `\\${c}`);
    const { data: similar, error: dupErr } = await sb.from("master_lenders").select("id, name, lender_type").ilike("name", `%${escaped}%`).limit(50);
    if (dupErr) return errorResult(dupErr.message);
    const dupes = ((similar ?? []) as Array<Record<string, unknown>>).filter(
      (r) => String(r.name ?? "").trim().toLowerCase() === cleanName.toLowerCase(),
    );
    if (dupes.length > 0) {
      return {
        ...textResult(
          {
            error: "duplicate",
            field: "name",
            message: `A funding source named "${cleanName}" already exists. Use update_lender with one of these ids instead.`,
            matches: dupes.map((d) => ({ id: d.id, name: d.name, lender_type: d.lender_type })),
          },
          { duplicate: true, count: dupes.length },
        ),
        isError: true as const,
      };
    }

    const { data, error } = await sb.rpc("mcp_create_lender", { p_patch: { ...fields, name: cleanName }, p_source: source ?? null, p_change_reason: change_reason ?? null });
    if (error) return errorResult(error.message);
    if (!data) return errorResult("Funding source was not created (permission denied).");
    return textResult(data);
  },
});
