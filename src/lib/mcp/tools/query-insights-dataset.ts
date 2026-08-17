import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { INSIGHTS_DATASETS } from "../insights";

const OPERATORS = ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in"] as const;

export default defineTool({
  name: "query_insights_dataset",
  title: "Query any Insights source dataset",
  description:
    `Read-only escape hatch for the Insights page: query any of its underlying datasets directly when no purpose-built metric tool covers the question. Allowed datasets: ${INSIGHTS_DATASETS.join(", ")}. Supply optional column selection, filters (column + operator + value), ordering, and a row limit. Everything runs through the signed-in user's row-level security, so results match exactly what that user sees in the UI. Aggregate the returned rows yourself.`,
  inputSchema: {
    dataset: z.enum(INSIGHTS_DATASETS),
    columns: z.string().trim().max(1000).optional().describe("Comma-separated column list; defaults to all columns."),
    filters: z
      .array(
        z.object({
          column: z.string().trim().min(1).max(80),
          op: z.enum(OPERATORS).default("eq"),
          value: z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.union([z.string(), z.number()]))]),
        }),
      )
      .max(10)
      .optional(),
    order_by: z.string().trim().max(80).optional(),
    ascending: z.boolean().default(false),
    limit: z.number().int().min(1).max(1000).default(200),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ dataset, columns, filters, order_by, ascending, limit }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);

    let q = sb.from(dataset).select(columns?.trim() || "*").limit(limit);
    for (const f of filters ?? []) {
      switch (f.op) {
        case "in":
          q = q.in(f.column, Array.isArray(f.value) ? f.value : [f.value as string]);
          break;
        case "is":
          q = q.is(f.column, f.value as null | boolean);
          break;
        default: {
          const apply = q as unknown as Record<string, (col: string, val: unknown) => typeof q>;
          q = apply[f.op].call(q, f.column, f.value);
        }
      }
    }
    if (order_by) q = q.order(order_by, { ascending, nullsFirst: false });

    const { data, error } = await q;
    if (error) {
      console.error("[query_insights_dataset] error", { dataset, user_id: ctx.getUserId?.(), message: error.message });
      return errorResult(error.message);
    }
    const rows = (data ?? []) as unknown[];
    return textResult(rows, { dataset, count: rows.length, rows });
  },
});
