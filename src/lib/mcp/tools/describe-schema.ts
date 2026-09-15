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
    include_field_layout: z
      .boolean()
      .default(false)
      .describe(
        "Also return the configured Deal Information field layout (order + visibility) per company, and which deal columns are actually populated per pipeline.",
      ),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ tables, include_field_layout }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;

    let fieldLayout: unknown = undefined;
    if (include_field_layout) {
      const sbLayout = supabaseForUser(ctx);
      const { data: settings } = await sbLayout
        .from("company_settings")
        .select("company_id, deal_info_layout");
      const { data: pipes } = await sbLayout.from("deal_pipelines").select("id, name, company_id");

      // Which deal columns actually carry data per pipeline (sampled, first 500 deals each).
      const usage: Array<{ pipeline_id: string; pipeline_name: string | null; populated_fields: string[]; sampled_deals: number }> = [];
      for (const p of (pipes ?? []) as Array<{ id: string; name: string | null }>) {
        const { data: sample } = await sbLayout
          .from("deals")
          .select("*")
          .eq("pipeline_id", p.id)
          .limit(500);
        const rowsSample = (sample ?? []) as Array<Record<string, unknown>>;
        const populated = new Set<string>();
        for (const r of rowsSample) {
          for (const [k, v] of Object.entries(r)) {
            if (v !== null && v !== undefined && v !== "") populated.add(k);
          }
        }
        usage.push({
          pipeline_id: p.id,
          pipeline_name: p.name ?? null,
          populated_fields: Array.from(populated).sort(),
          sampled_deals: rowsSample.length,
        });
      }

      fieldLayout = {
        company_deal_info_layout: settings ?? [],
        pipeline_field_usage: usage,
        note: "Deal Information field order/visibility is configured per company; pipeline_field_usage shows which deal columns are actually used by deals in each pipeline (sample of up to 500 deals).",
      };
    }

    if (!tables || tables.length === 0) {
      return textResult(
        { describable_tables: DESCRIBABLE, ...(fieldLayout ? { field_layout: fieldLayout } : {}) },
        { count: DESCRIBABLE.length },
      );
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
      ...(fieldLayout ? { field_layout: fieldLayout } : {}),
    };
    return textResult(payload, { tables: tables.join(","), column_count: rows.length });
  },
});
