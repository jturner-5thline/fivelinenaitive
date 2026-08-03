import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "search_companies",
  title: "Search companies",
  description: "Search CRM companies by name, domain, or website. Returns full row records.",
  inputSchema: {
    query: z.string().trim().min(1).max(200),
    limit: z.number().int().min(1).max(100).default(25),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    const like = `%${query}%`;
    const { data, error } = await sb
      .from("crm_companies")
      .select(
        "id, name, domain, website_url, industry, company_type, status, hq_city, hq_state, hq_country, created_at",
      )
      .or(`name.ilike.${like},domain.ilike.${like},website_url.ilike.${like}`)
      .limit(limit);
    if (error) return errorResult(error.message);
    const rows = data ?? [];
    return textResult(rows, { count: rows.length, companies: rows });
  },
});