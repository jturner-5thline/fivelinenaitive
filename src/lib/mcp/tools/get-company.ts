import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

/** Child tables that hang off a single CRM company id. */
const CHILD_TABLES: Array<{ table: string; column: string; key: string; limit: number; order?: string }> = [
  { table: "crm_company_activities", column: "crm_company_id", key: "activities", limit: 500, order: "created_at" },
  { table: "crm_company_attachments", column: "crm_company_id", key: "attachments", limit: 200 },
  { table: "crm_company_team", column: "crm_company_id", key: "team", limit: 200 },
  { table: "contact_company_associations", column: "company_id", key: "contact_associations", limit: 500 },
  { table: "master_lenders", column: "crm_company_id", key: "funding_sources", limit: 200 },
  { table: "tasks", column: "crm_company_id", key: "tasks", limit: 300, order: "created_at" },
];

export default defineTool({
  name: "get_company",
  title: "Get company detail",
  description:
    "Return the COMPLETE record for one CRM company — every column on `crm_companies` (name, domains, industry/sub-industry, type, status, lifecycle stage, employee count/range, revenue/ARR/MRR/contract values, contract and renewal dates, HQ address/city/state/country/postal, regions served, key products, description, socials, phone, tags, owner, source system/external ids, custom fields, notes, timestamps) — plus its related rows: contacts at the company, deals linked to it (with deal name, stage, status, pipeline), full activity history, attachments, team members, contact-to-company match/association history, linked funding sources, tasks, and the parent/child company records. Look up by `company_id`, `domain`, or partial `name` (ambiguous name matches return the candidates to choose from).",
  inputSchema: {
    company_id: z.string().uuid().optional(),
    domain: z.string().trim().max(253).optional(),
    name: z.string().trim().min(1).max(200).optional().describe("Case-insensitive partial name match."),
    include_related: z
      .boolean()
      .default(true)
      .describe("Include contacts, deals, activities, attachments, team, funding sources, tasks and match history."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ company_id, domain, name, include_related }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    if (!company_id && !domain && !name) return errorResult("Provide company_id, domain or name.");
    const sb = supabaseForUser(ctx);

    let company: Record<string, unknown> | null = null;
    if (company_id) {
      const { data, error } = await sb.from("crm_companies").select("*").eq("id", company_id).maybeSingle();
      if (error) return errorResult(error.message);
      company = (data as Record<string, unknown> | null) ?? null;
    } else if (domain) {
      const like = `%${domain}%`;
      const { data, error } = await sb
        .from("crm_companies")
        .select("*")
        .or(`domain.ilike.${like},domain_normalized.ilike.${like},website_url.ilike.${like}`)
        .limit(5);
      if (error) return errorResult(error.message);
      company = ((data ?? [])[0] as Record<string, unknown> | undefined) ?? null;
    } else {
      const like = `%${name}%`;
      const { data, error } = await sb.from("crm_companies").select("*").ilike("name", like).limit(10);
      if (error) return errorResult(error.message);
      const matches = (data ?? []) as Array<Record<string, unknown>>;
      if (matches.length > 1) {
        const target = String(name).toLowerCase();
        const exact = matches.find((m) => String(m.name ?? "").toLowerCase() === target);
        if (!exact) {
          return textResult(
            {
              ambiguous: true,
              message: "Multiple companies match that name; call get_company again with one of these ids.",
              matches: matches.map((m) => ({
                id: m.id,
                name: m.name,
                domain: m.domain,
                industry: m.industry,
                status: m.status,
              })),
            },
            { count: matches.length },
          );
        }
        company = exact;
      } else {
        company = matches[0] ?? null;
      }
    }

    if (!company) return errorResult("Company not found (or not visible to this user).");
    const id = company.id as string;
    const payload: Record<string, unknown> = { company };

    if (include_related) {
      const related: Record<string, unknown> = {};

      const { data: contacts, error: ctErr } = await sb
        .from("contacts")
        .select("*")
        .eq("crm_company_id", id)
        .limit(500);
      related.contacts = ctErr ? { error: ctErr.message } : contacts ?? [];

      const { data: deals, error: dErr } = await sb
        .from("deals")
        .select("id, company, stage, status, pipeline_id, deal_value, created_at, updated_at")
        .eq("crm_company_id", id)
        .limit(500);
      related.deals = dErr
        ? { error: dErr.message }
        : (deals ?? []).map((d: Record<string, any>) => ({ ...d, deal_name: d.company ?? null }));

      const parentId = company.parent_company_id as string | null | undefined;
      if (parentId) {
        const { data: parent, error: pErr } = await sb
          .from("crm_companies")
          .select("*")
          .eq("id", parentId)
          .maybeSingle();
        related.parent_company = pErr ? { error: pErr.message } : parent ?? null;
      } else {
        related.parent_company = null;
      }

      const { data: children, error: chErr } = await sb
        .from("crm_companies")
        .select("id, name, domain, industry, status")
        .eq("parent_company_id", id)
        .limit(200);
      related.child_companies = chErr ? { error: chErr.message } : children ?? [];

      await Promise.all(
        CHILD_TABLES.map(async ({ table, column, key, limit, order }) => {
          let q = sb.from(table as never).select("*").eq(column, id).limit(limit);
          if (order) q = q.order(order, { ascending: false, nullsFirst: false });
          const { data, error } = await q;
          // A blocked or empty child table must not fail the whole lookup.
          related[key] = error ? { error: error.message } : data ?? [];
        }),
      );

      // Contact-to-company matching history is keyed by name/domain, not id.
      const { data: matchAudit, error: maErr } = await sb
        .from("contact_company_match_audit")
        .select("*")
        .eq("company_id", id)
        .limit(200);
      related.company_match_audit = maErr ? { error: maErr.message } : matchAudit ?? [];

      payload.related = related;
    }

    return textResult(payload, { company_id: id, name: String(company.name ?? "") });
  },
});
