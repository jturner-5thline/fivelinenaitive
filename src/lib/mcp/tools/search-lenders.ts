import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "search_lenders",
  title: "Search funding sources / lenders",
  description:
    "Search the master funding-source (lender) directory by name. Optionally filter by deal_size, which returns funding sources whose min_deal <= size <= max_deal. Returns id, name, lender_type, tier, min_deal / max_deal (also echoed as min_deal_size / max_deal_size for convenience), loan_types, industries, geographies, appetite_status and website.",
  inputSchema: {
    query: z.string().trim().max(200).optional(),
    deal_size: z.number().nonnegative().optional(),
    lender_type: z.string().trim().max(100).optional(),
    limit: z.number().int().min(1).max(200).default(25),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, deal_size, lender_type, limit }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("master_lenders")
      .select(
        "id, name, lender_type, tier, active, appetite_status, min_deal, max_deal, sweet_spot_min, sweet_spot_max, loan_types, industries, geographies, website, contact_name, contact_title",
      )
      .limit(limit);
    if (query) q = q.ilike("name", `%${query}%`);
    if (lender_type) q = q.ilike("lender_type", `%${lender_type}%`);
    if (deal_size !== undefined) {
      q = q
        .or(`min_deal.is.null,min_deal.lte.${deal_size}`)
        .or(`max_deal.is.null,max_deal.gte.${deal_size}`);
    }
    const { data, error } = await q;
    if (error) return errorResult(error.message);
    const rows = (data ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      min_deal_size: r.min_deal ?? null,
      max_deal_size: r.max_deal ?? null,
    }));
    return textResult(rows, { count: rows.length });
  },
});
