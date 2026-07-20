import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "create_company",
  title: "Create company",
  description: "Create a CRM company record.",
  inputSchema: {
    name: z.string().trim().min(1).max(300),
    website_url: z.string().trim().max(500).optional(),
    industry: z.string().trim().max(200).optional(),
    city: z.string().trim().max(200).optional(),
    state: z.string().trim().max(200).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    const row: Record<string, unknown> = { created_by: ctx.getUserId() };
    for (const [k, v] of Object.entries(input)) if (v !== undefined) row[k] = v;
    const { data, error } = await sb.from("crm_companies").insert(row).select("id, name, website_url").maybeSingle();
    if (error) return errorResult(error.message);
    return textResult(data, { company_id: data?.id });
  },
});