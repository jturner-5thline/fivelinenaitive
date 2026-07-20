import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "search_lenders",
  title: "Search funding sources / lenders",
  description:
    "Search the master lender directory by name, product, or geography. Optionally filter by deal_size (returns lenders whose min_deal_size <= size <= max_deal_size).",
  inputSchema: {
    query: z.string().trim().max(200).optional(),
    deal_size: z.number().nonnegative().optional(),
    limit: z.number().int().min(1).max(100).default(25),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, deal_size, limit }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("master_lenders")
      .select("id, name, lender_type, tier, min_deal_size, max_deal_size, loan_types, geographies, website")
      .limit(limit);
    if (query) q = q.ilike("name", `%${query}%`);
    if (deal_size !== undefined) q = q.lte("min_deal_size", deal_size).gte("max_deal_size", deal_size);
    const { data, error } = await q;
    if (error) return errorResult(error.message);
    return textResult(data ?? [], { count: data?.length ?? 0 });
  },
});