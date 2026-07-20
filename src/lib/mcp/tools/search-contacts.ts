import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "search_contacts",
  title: "Search contacts",
  description: "Search CRM contacts by name, email, or domain. Returns id, name, email, phone, domain, title, company.",
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
      .from("contacts")
      .select("id, first_name, last_name, email, phone, website_url, job_title, company, created_at")
      .or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like},website_url.ilike.${like},company.ilike.${like}`)
      .limit(limit);
    if (error) return errorResult(error.message);
    return textResult(data ?? [], { count: data?.length ?? 0 });
  },
});