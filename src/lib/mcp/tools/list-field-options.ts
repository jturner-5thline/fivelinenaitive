import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { FIELD_OPTION_KEYS, loadFieldOptions, type FieldOptionKey } from "../fieldOptions";
import { callerCompanyId } from "../channelPartners";

export default defineTool({
  name: "list_field_options",
  title: "List allowed field values",
  description: `Read-only. Return the option list the app's dropdowns and filters use for a field, so writes use valid values. Supported table.column keys: ${FIELD_OPTION_KEYS.join(", ")}. Pass one or more as fields, or table + column. create_lender/update_lender reject values outside these lists unless allow_new_options: true.`,
  inputSchema: {
    fields: z.array(z.enum(FIELD_OPTION_KEYS)).min(1).max(FIELD_OPTION_KEYS.length).optional(),
    table: z.string().trim().max(80).optional(),
    column: z.string().trim().max(80).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ fields, table, column }, ctx) => {
    const denied = requireAuth(ctx);
    if (denied) return denied;
    const keys: string[] = fields ?? (table && column ? [`${table}.${column}`] : [...FIELD_OPTION_KEYS]);
    const bad = keys.filter((k) => !(FIELD_OPTION_KEYS as readonly string[]).includes(k));
    if (bad.length) return errorResult(`Unsupported field(s): ${bad.join(", ")}. Supported: ${FIELD_OPTION_KEYS.join(", ")}.`);
    const sb = supabaseForUser(ctx);
    try {
      const companyId = keys.includes("contacts.contact_type") ? await callerCompanyId(sb, ctx.getUserId()) : null;
      const options = await Promise.all(keys.map((k) => loadFieldOptions(sb, k as FieldOptionKey, companyId)));
      return textResult({ options }, { count: options.length });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
