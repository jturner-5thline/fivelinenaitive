import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

const DEFAULT_FIELDS =
  "id, name, domain, website_url, industry, company_type, status, hq_city, hq_state, hq_country, created_at, updated_at";

const FIELD_RE = /^[a-zA-Z0-9_,\s]+$/;

export default defineTool({
  name: "search_companies",
  title: "Search companies",
  description:
    "Search CRM companies by name, domain or website, with optional filters (industry, company_type, status, lifecycle_stage, city, state, country, tag, owner, has_deals). Paginated: returns total_count/returned/offset/next_offset/has_more. Pass `fields: \"*\"` for every column on the company record, or a comma-separated column list; defaults to a summary set. Omit `query` to browse all companies. Use `get_company` for one company's full record plus contacts, deals, activity history and attachments.",
  inputSchema: {
    query: z.string().trim().min(1).max(200).optional(),
    fields: z.string().trim().max(4000).optional().describe('"*" for all columns, or a comma-separated column list.'),
    industry: z.string().trim().max(120).optional().describe("Case-insensitive partial match on industry or sub_industry."),
    company_type: z.string().trim().max(120).optional(),
    status: z.string().trim().max(120).optional(),
    lifecycle_stage: z.string().trim().max(120).optional(),
    city: z.string().trim().max(120).optional(),
    state: z.string().trim().max(120).optional(),
    country: z.string().trim().max(120).optional(),
    tag: z.string().trim().max(120).optional().describe("Match a single tag in the company's tags array."),
    owner_user_id: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(500).default(50),
    offset: z.number().int().min(0).default(0),
    order_by: z.string().trim().max(80).default("created_at"),
    ascending: z.boolean().default(false),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (
    { query, fields, industry, company_type, status, lifecycle_stage, city, state, country, tag, owner_user_id, limit, offset, order_by, ascending },
    ctx,
  ) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);

    let select = DEFAULT_FIELDS;
    if (fields) {
      const f = fields.trim();
      if (f === "*") select = "*";
      else {
        if (!FIELD_RE.test(f)) return errorResult("fields may only contain column names, commas and spaces.");
        const cols = new Set(f.split(",").map((c) => c.trim()).filter(Boolean));
        cols.add("id");
        cols.add("name");
        select = [...cols].join(", ");
      }
    }

    let q = sb
      .from("crm_companies")
      .select(select, { count: "exact" })
      .range(offset, offset + limit - 1);
    if (query) {
      const like = `%${query}%`;
      q = q.or(`name.ilike.${like},domain.ilike.${like},website_url.ilike.${like}`);
    }
    if (industry) q = q.or(`industry.ilike.%${industry}%,sub_industry.ilike.%${industry}%`);
    if (company_type) q = q.ilike("company_type", company_type);
    if (status) q = q.ilike("status", status);
    if (lifecycle_stage) q = q.ilike("lifecycle_stage", lifecycle_stage);
    if (city) q = q.ilike("hq_city", `%${city}%`);
    if (state) q = q.ilike("hq_state", `%${state}%`);
    if (country) q = q.ilike("hq_country", `%${country}%`);
    if (tag) q = q.contains("tags", [tag]);
    if (owner_user_id) q = q.eq("owner_user_id", owner_user_id);
    if (order_by) q = q.order(order_by, { ascending, nullsFirst: false });

    const { data, error, count } = await q;
    if (error) return errorResult(error.message);
    const companies = (data ?? []) as unknown[];
    const total_count = count ?? companies.length;
    const next = offset + companies.length;
    const has_more = next < total_count;
    return textResult(
      { companies, total_count, returned: companies.length, offset, next_offset: has_more ? next : null, has_more },
      { count: companies.length, total_count, offset, next_offset: has_more ? next : null, has_more },
    );
  },
});
