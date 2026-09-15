import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

const DEFAULT_FIELDS =
  "id, first_name, last_name, full_name, email, phone_mobile, phone_work, phone_other, website_url, job_title, city, state, country, linkedin_url, contact_type, tags, crm_company_id, last_contact_date, created_at, updated_at";

/** Only simple identifier characters — never interpolate arbitrary text into select(). */
const FIELD_RE = /^[a-zA-Z0-9_,\s]+$/;

export default defineTool({
  name: "search_contacts",
  title: "Search contacts",
  description:
    "Search CRM contacts by name, email, domain, job title, phone or LinkedIn. Returns a paginated result set with total_count/returned/offset/next_offset/has_more — keep calling with next_offset until has_more is false. By default a summary field set is returned; pass `fields: \"*\"` for EVERY column on the contact record (all standard and custom fields), or a comma-separated column list. Optional filters narrow by contact type, tag, company, city/state/country, or whether an email exists. Use `get_contact` for one contact's full record plus activities, change history, deals, attachments and suggestions; `describe_schema` lists the available column names.",
  inputSchema: {
    query: z.string().trim().min(1).max(200).optional().describe("Free-text match on name, email, domain, title, phone, LinkedIn. Omit to browse all contacts."),
    fields: z.string().trim().max(4000).optional().describe('"*" for all columns, or a comma-separated column list. Defaults to a summary set.'),
    contact_type: z.string().trim().max(100).optional(),
    tag: z.string().trim().max(100).optional().describe("Match a single tag in the contact's tags array."),
    crm_company_id: z.string().uuid().optional(),
    city: z.string().trim().max(100).optional(),
    state: z.string().trim().max(100).optional(),
    country: z.string().trim().max(100).optional(),
    has_email: z.boolean().optional(),
    order_by: z.string().trim().max(80).default("created_at"),
    ascending: z.boolean().default(false),
    limit: z.number().int().min(1).max(500).default(50),
    offset: z.number().int().min(0).default(0),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const { query, fields, contact_type, tag, crm_company_id, city, state, country, has_email, order_by, ascending, limit, offset } =
      input;
    const sb = supabaseForUser(ctx);

    let select = DEFAULT_FIELDS;
    if (fields) {
      const f = fields.trim();
      if (f === "*") select = "*";
      else {
        if (!FIELD_RE.test(f)) return errorResult("fields may only contain column names, commas and spaces.");
        const cols = new Set(f.split(",").map((c) => c.trim()).filter(Boolean));
        cols.add("id");
        select = [...cols].join(", ");
      }
    }

    let q = sb
      .from("contacts")
      .select(select, { count: "exact" })
      .range(offset, offset + limit - 1);

    if (query) {
      const like = `%${query}%`;
      q = q.or(
        `first_name.ilike.${like},last_name.ilike.${like},full_name.ilike.${like},email.ilike.${like},website_url.ilike.${like},job_title.ilike.${like},phone_mobile.ilike.${like},phone_work.ilike.${like},linkedin_url.ilike.${like}`,
      );
    }
    if (contact_type) q = q.eq("contact_type", contact_type);
    if (tag) q = q.contains("tags", [tag]);
    if (crm_company_id) q = q.eq("crm_company_id", crm_company_id);
    if (city) q = q.ilike("city", city);
    if (state) q = q.ilike("state", state);
    if (country) q = q.ilike("country", country);
    if (has_email === true) q = q.not("email", "is", null);
    if (has_email === false) q = q.is("email", null);
    if (order_by) q = q.order(order_by, { ascending, nullsFirst: false });

    const { data, error, count } = await q;
    if (error) return errorResult(error.message);

    const rows = (data ?? []) as Array<Record<string, any>>;
    const contacts = rows.map((c) => ({
      ...c,
      name: c.full_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || null,
      phone: c.phone_mobile || c.phone_work || c.phone_other || null,
    }));
    const total_count = count ?? contacts.length;
    const next = offset + contacts.length;
    const has_more = next < total_count;
    return textResult(
      { contacts, total_count, returned: contacts.length, offset, next_offset: has_more ? next : null, has_more },
      { count: contacts.length, total_count, offset, next_offset: has_more ? next : null, has_more },
    );
  },
});
