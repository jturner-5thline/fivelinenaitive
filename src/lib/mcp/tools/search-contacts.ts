import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "search_contacts",
  title: "Search contacts",
  description: "Search CRM contacts by name, email, or domain. Returns id, name, email, phones, domain, title, company.",
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
      .select(
        "id, first_name, last_name, full_name, email, phone_mobile, phone_work, phone_other, website_url, job_title, created_at, crm_company:crm_companies!crm_company_id(id, name)",
      )
      .or(
        `first_name.ilike.${like},last_name.ilike.${like},full_name.ilike.${like},email.ilike.${like},website_url.ilike.${like}`,
      )
      .limit(limit);
    if (error) return errorResult(error.message);
    const rows = (data ?? []).map((c: any) => ({
      id: c.id,
      name:
        c.full_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || null,
      first_name: c.first_name,
      last_name: c.last_name,
      email: c.email,
      phone: c.phone_mobile || c.phone_work || c.phone_other || null,
      domain: c.website_url,
      job_title: c.job_title,
      company: c.crm_company?.name ?? null,
      company_id: c.crm_company?.id ?? null,
      created_at: c.created_at,
    }));
    return textResult(rows, { count: rows.length });
  },
});