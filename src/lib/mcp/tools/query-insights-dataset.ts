import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { INSIGHTS_DATASETS } from "../insights";

const OPERATORS = ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in"] as const;

/** Compact default columns for wide tables when `columns` is omitted (pass columns="*" for everything). */
export const COMPACT_COLUMNS: Partial<Record<string, string>> = {
  contacts: "id, first_name, last_name, full_name, email, job_title, contact_type, lifecycle_stage, status, lead_source, owner_user_id, crm_company_id, city, state, country, phone_work, phone_mobile, linkedin_url, tags, referral_agreement_on_file, w9_on_file, referral_fee, created_at, updated_at",
  crm_companies: "id, name, domain, website_url, company_type, status, industry, lifecycle_stage, owner_user_id, hq_city, hq_state, hq_country, phone, tags, last_activity_date, next_activity_date, parent_company_id, created_at, updated_at",
  deals: "id, company, stage, status, pipeline_id, value, deal_class, referred_by, referred_by_contact_id, crm_company_id, closing_date, created_at, updated_at",
  master_lenders: "id, name, lender_type, loan_types, tier, appetite_status, active, min_deal, max_deal, industries, geographies, crm_company_id, website, created_at, updated_at",
};

const filterSchema = z.object({
  column: z.string().trim().min(1).max(80),
  op: z.enum(OPERATORS).default("eq"),
  value: z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.union([z.string(), z.number()]))]),
});

const quote = (v: unknown) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/** Build one PostgREST `or=(...)` expression from conditions; values are quoted so they cannot add filters. */
export function buildOrExpression(conds: Array<{ column?: string; op?: (typeof OPERATORS)[number]; value?: unknown }>): string {
  return conds.map((raw) => {
    const c = { column: String(raw.column ?? ""), op: raw.op ?? "eq", value: raw.value ?? null };
    if (!/^[a-z_][a-z0-9_]*$/i.test(c.column)) throw new Error(`Invalid column name in or group: ${c.column}`);
    if (c.op === "is") {
      if (!(c.value === null || typeof c.value === "boolean")) throw new Error("`is` needs null, true or false");
      return `${c.column}.is.${c.value === null ? "null" : String(c.value)}`;
    }
    if (c.op === "in") return `${c.column}.in.(${(Array.isArray(c.value) ? c.value : [c.value]).map(quote).join(",")})`;
    return `${c.column}.${c.op}.${quote(c.value)}`;
  }).join(",");
}

export default defineTool({
  name: "query_insights_dataset",
  title: "Query any Insights source dataset",
  description:
    `Read-only escape hatch: query any platform dataset directly when no purpose-built tool covers the question. Allowed datasets: ${INSIGHTS_DATASETS.join(", ")}. Supply optional column selection (defaults to ALL columns, except wide tables — contacts, crm_companies, deals, master_lenders — which default to a compact core set; pass columns="*" for every column), filters (column + operator + value, all ANDed), or_groups (each group is an OR of conditions; groups are ANDed with each other and with filters), ordering, limit and offset. Results are paginated and the response reports total_count, returned, offset, next_offset and has_more — keep calling with next_offset until has_more is false, otherwise you are looking at a partial set. Use describe_schema to learn the available column names. Everything runs through the signed-in user's row-level security, so results match exactly what that user sees in the UI. Aggregate the returned rows yourself.`,
  inputSchema: {
    dataset: z.enum(INSIGHTS_DATASETS),
    columns: z.string().trim().max(1000).optional().describe("Comma-separated column list, or * for all. Defaults to all columns, or a compact core set on wide tables."),
    filters: z.array(filterSchema).max(10).optional(),
    or_groups: z.array(z.array(filterSchema).min(2).max(10)).max(5).optional().describe("Each inner array matches rows satisfying ANY of its conditions, e.g. [[{column:'email',op:'is',value:null},{column:'email',op:'eq',value:''}]]."),
    order_by: z.string().trim().max(80).optional(),
    ascending: z.boolean().default(false),
    limit: z.number().int().min(1).max(1000).default(200),
    offset: z.number().int().min(0).default(0).describe("Row offset for pagination; use next_offset from the previous response."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ dataset, columns, filters, or_groups, order_by, ascending, limit, offset }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);

    let q = sb
      .from(dataset)
      .select(columns?.trim() || COMPACT_COLUMNS[dataset] || "*", { count: "exact" })
      .range(offset, offset + limit - 1);
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
    try {
      for (const g of or_groups ?? []) q = q.or(buildOrExpression(g));
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
    if (order_by) q = q.order(order_by, { ascending, nullsFirst: false });

    const { data, error, count } = await q;
    if (error) {
      console.error("[query_insights_dataset] error", { dataset, user_id: ctx.getUserId?.(), message: error.message });
      return errorResult(error.message);
    }
    const rows = (data ?? []) as unknown[];
    const total_count = count ?? rows.length;
    const next = offset + rows.length;
    const has_more = next < total_count;
    const payload = {
      dataset,
      columns: columns?.trim() || (COMPACT_COLUMNS[dataset] ? "compact default (pass columns=\"*\" for every column)" : "*"),
      total_count,
      returned: rows.length,
      offset,
      next_offset: has_more ? next : null,
      has_more,
      rows,
    };
    return textResult(payload, {
      dataset,
      count: rows.length,
      total_count,
      offset,
      next_offset: has_more ? next : null,
      has_more,
    });
  },
});
