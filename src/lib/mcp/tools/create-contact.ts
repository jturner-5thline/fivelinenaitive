import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "create_contact",
  title: "Create contact",
  description: "Create a CRM contact. Provide at minimum an email or first_name/last_name.",
  inputSchema: {
    first_name: z.string().trim().max(200).optional(),
    last_name: z.string().trim().max(200).optional(),
    email: z.string().trim().email().optional(),
    phone: z.string().trim().max(50).optional().describe("Stored as mobile phone."),
    website_url: z.string().trim().max(500).optional().describe("Contact domain (matches to company)."),
    job_title: z.string().trim().max(200).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    if (!input.email && !input.first_name && !input.last_name) {
      return errorResult("Provide at least email or first_name/last_name.");
    }
    const sb = supabaseForUser(ctx);
    const { phone, ...rest } = input;
    const row: Record<string, unknown> = { created_by: ctx.getUserId() };
    for (const [k, v] of Object.entries(rest)) if (v !== undefined) row[k] = v;
    if (phone !== undefined) row.phone_mobile = phone;
    const { data, error } = await sb
      .from("contacts")
      .insert(row)
      .select("id, first_name, last_name, email, phone_mobile, website_url, job_title")
      .maybeSingle();
    if (error) return errorResult(error.message);
    return textResult(data, { contact_id: data?.id });
  },
});