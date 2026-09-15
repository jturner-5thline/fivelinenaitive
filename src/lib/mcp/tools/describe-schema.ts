import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { INSIGHTS_DATASETS } from "../insights";

/** Extra tables worth describing even though they are not Insights datasets. */
const EXTRA_TABLES = [
  "deal_writeups",
  "deal_memos",
  "deal_checklist_items",
  "deal_checklist_status",
  "deal_attachments",
  "deal_status_notes",
  "deal_financial_data",
  "deal_flag_notes",
  "deal_ownership",
  "deal_space_notes",
  "deal_activity",
  "contact_deals",
  "deal_pipeline_configs",
] as const;

const DESCRIBABLE = Array.from(new Set<string>([...INSIGHTS_DATASETS, ...EXTRA_TABLES])).sort();

type ColumnRow = {
  table_name: string;
  column_name: string;
  ordinal_position: number;
  data_type: string;
  udt_name: string;
  is_nullable: string;
  column_default: string | null;
  enum_values: string[] | null;
};

export default defineTool({
  name: "describe_schema",
  title: "Describe table schema",
  description:
    `Field discovery: return the column list for one or more platform tables — column name, data type, nullability, default, and (for enum columns) the complete set of allowed values. Use this before pulling data so you know exactly which fields exist rather than guessing names; pair it with \`list_deals\` (\`fields: "*"\`) or \`query_insights_dataset\` to extract complete records. Omit \`tables\` to get the describable table list. Describable tables: ${DESCRIBABLE.join(", ")}.`,
  inputSchema: {
    tables: z
      .array(z.string().trim().min(1).max(80))
      .max(20)
      .optional()
      .describe("Table names to describe. Omit to list the tables that can be described."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ tables }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    if (!tables || tables.length === 0) {
      return textResult({ describable_tables: DESCRIBABLE }, { count: DESCRIBABLE.length });
    }
    const invalid = tables.filter((t) => !DESCRIBABLE.includes(t));
    if (invalid.length) {
      return errorResult(
        `Not describable: ${invalid.join(", ")}. Allowed tables: ${DESCRIBABLE.join(", ")}.`,
      );
    }
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb.rpc("mcp_describe_tables", { p_tables: tables });
    if (error) {
      console.error("[describe_schema] error", { tables, user_id: ctx.getUserId?.(), message: error.message });
      return errorResult(error.message);
    }
    const rows = (data ?? []) as ColumnRow[];
    const grouped: Record<string, Omit<ColumnRow, "table_name">[]> = {};
    for (const r of rows) {
      const { table_name, ...rest } = r;
      (grouped[table_name] ??= []).push(rest);
    }
    const payload = {
      tables: Object.entries(grouped).map(([table, columns]) => ({
        table,
        column_count: columns.length,
        columns,
      })),
    };
    return textResult(payload, { tables: tables.join(","), column_count: rows.length });
  },
});
