import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

const DEFAULT_FIELDS =
  "id, name, lender_type, tier, active, appetite_status, min_deal, max_deal, sweet_spot_min, sweet_spot_max, loan_types, industries, geographies, website, contact_name, contact_title";

export default defineTool({
  name: "search_lenders",
  title: "Search funding sources / lenders",
  description:
    "Search the master funding-source (lender) directory. By default returns a summary card per lender; pass fields=\"*\" to get EVERY column on master_lenders (criteria, leverage, revenue/EBITDA minimums, industries to avoid, excluded geographies, referral terms, NDA, sync metadata, address, notes) or a comma-separated column list. Filters: name query, deal_size (min_deal <= size <= max_deal), lender_type, tier, appetite_status, active, industry, geography, loan_type. Results are paginated — the response returns total_count, returned, offset, next_offset and has_more; keep calling with next_offset to walk the entire directory. Use `get_lender` for one lender's full record plus contacts, notes, attachments, change history and linked deals.",
  inputSchema: {
    query: z.string().trim().max(200).optional(),
    deal_size: z.number().nonnegative().optional(),
    lender_type: z.string().trim().max(100).optional(),
    tier: z.string().trim().max(60).optional(),
    appetite_status: z.string().trim().max(60).optional(),
    active: z.boolean().optional(),
    industry: z.string().trim().max(120).optional().describe("Matches a value in the lender's industries array."),
    geography: z.string().trim().max(120).optional().describe("Matches a value in the lender's geographies array."),
    loan_type: z.string().trim().max(120).optional().describe("Matches a value in the lender's loan_types array."),
    fields: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .describe('"*" for every column, or a comma-separated column list. Defaults to a summary set.'),
    limit: z.number().int().min(1).max(500).default(25),
    offset: z.number().int().min(0).default(0),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (
    { query, deal_size, lender_type, tier, appetite_status, active, industry, geography, loan_type, fields, limit, offset },
    ctx,
  ) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);

    let select = DEFAULT_FIELDS;
    if (fields) {
      if (fields.trim() === "*") select = "*";
      else if (!/^[a-zA-Z0-9_,\s]+$/.test(fields)) return errorResult("fields may only contain column names, commas and spaces, or be \"*\".");
      else {
        const cols = new Set(fields.split(",").map((f) => f.trim()).filter(Boolean));
        cols.add("id");
        cols.add("name");
        select = Array.from(cols).join(", ");
      }
    }

    let q = sb
      .from("master_lenders")
      .select(select, { count: "exact" })
      .order("name", { ascending: true })
      .range(offset, offset + limit - 1);
    if (query) q = q.ilike("name", `%${query}%`);
    if (lender_type) q = q.ilike("lender_type", `%${lender_type}%`);
    if (tier) q = q.eq("tier", tier);
    if (appetite_status) q = q.eq("appetite_status", appetite_status);
    if (active !== undefined) q = q.eq("active", active);
    if (industry) q = q.contains("industries", [industry]);
    if (geography) q = q.contains("geographies", [geography]);
    if (loan_type) q = q.contains("loan_types", [loan_type]);
    if (deal_size !== undefined) {
      q = q
        .or(`min_deal.is.null,min_deal.lte.${deal_size}`)
        .or(`max_deal.is.null,max_deal.gte.${deal_size}`);
    }
    const { data, error, count } = await q;
    if (error) return errorResult(error.message);
    const rows = ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
      ...r,
      min_deal_size: r.min_deal ?? null,
      max_deal_size: r.max_deal ?? null,
    }));
    const total = count ?? rows.length;
    const hasMore = offset + rows.length < total;
    return textResult(
      {
        lenders: rows,
        total_count: total,
        returned: rows.length,
        offset,
        next_offset: hasMore ? offset + rows.length : null,
        has_more: hasMore,
      },
      { count: rows.length, total_count: total, offset, has_more: hasMore },
    );
  },
});
