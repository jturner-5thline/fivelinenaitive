import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

/** Child tables that hang off a single contact id. */
const CHILD_TABLES: Array<{ table: string; column: string; key: string; limit: number; order?: string }> = [
  { table: "contact_activities", column: "contact_id", key: "activities", limit: 300, order: "occurred_at" },
  { table: "contact_audit_log", column: "contact_id", key: "change_history", limit: 500, order: "created_at" },
  { table: "contact_company_associations", column: "contact_id", key: "company_associations", limit: 100 },
  { table: "contact_field_suggestions", column: "contact_id", key: "field_suggestions", limit: 200 },
  { table: "contact_field_suggestion_audit", column: "contact_id", key: "field_suggestion_audit", limit: 200 },
  { table: "crm_contact_attachments", column: "contact_id", key: "attachments", limit: 200 },
  { table: "lender_contacts", column: "contact_id", key: "lender_links", limit: 100 },
  { table: "partner_contacts", column: "contact_id", key: "partner_links", limit: 100 },
  { table: "crm_company_activities", column: "contact_id", key: "company_activities", limit: 200 },
  { table: "tasks", column: "contact_id", key: "tasks", limit: 300, order: "created_at" },
  { table: "channel_entries", column: "contact_id", key: "channel_entries", limit: 100 },
  { table: "referral_sources", column: "contact_id", key: "referral_sources", limit: 100 },
  { table: "ai_action_log", column: "contact_id", key: "ai_actions", limit: 300, order: "created_at" },
  {
    table: "claap_meeting_participants",
    column: "contact_id",
    key: "meeting_participation",
    limit: 300,
  },
];

export default defineTool({
  name: "get_contact",
  title: "Get contact detail",
  description:
    "Return the COMPLETE record for one CRM contact — every column on `contacts` (all custom and standard fields: names, all phone numbers, email(s), job title, geography/city/state/country, LinkedIn, tags, contact type, source, owner, last-contact timestamps, notes and every custom field) — plus its related rows: linked CRM company record, company associations, deals the contact is attached to (with deal name/stage/pipeline), logged activities, full field-level change history, AI field suggestions and their audit trail, attachments, and any funding-source or partner links. Look up by `contact_id`, or by `email` or partial `name` (ambiguous name matches return the candidates to choose from).",
  inputSchema: {
    contact_id: z.string().uuid().optional(),
    email: z.string().trim().max(320).optional(),
    name: z.string().trim().min(1).max(200).optional().describe("Case-insensitive partial name match."),
    include_related: z
      .boolean()
      .default(true)
      .describe("Include company, deals, activities, change history, suggestions, attachments and links."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ contact_id, email, name, include_related }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    if (!contact_id && !email && !name) return errorResult("Provide contact_id, email or name.");
    const sb = supabaseForUser(ctx);

    let contact: Record<string, unknown> | null = null;
    if (contact_id) {
      const { data, error } = await sb.from("contacts").select("*").eq("id", contact_id).maybeSingle();
      if (error) return errorResult(error.message);
      contact = (data as Record<string, unknown> | null) ?? null;
    } else if (email) {
      const { data, error } = await sb.from("contacts").select("*").ilike("email", email).limit(5);
      if (error) return errorResult(error.message);
      contact = ((data ?? [])[0] as Record<string, unknown> | undefined) ?? null;
    } else {
      const like = `%${name}%`;
      const { data, error } = await sb
        .from("contacts")
        .select("*")
        .or(`full_name.ilike.${like},first_name.ilike.${like},last_name.ilike.${like}`)
        .limit(10);
      if (error) return errorResult(error.message);
      const matches = (data ?? []) as Array<Record<string, unknown>>;
      if (matches.length > 1) {
        const target = String(name).toLowerCase();
        const exact = matches.find(
          (m) =>
            String(m.full_name ?? "").toLowerCase() === target ||
            [m.first_name, m.last_name].filter(Boolean).join(" ").toLowerCase() === target,
        );
        if (!exact) {
          return textResult(
            {
              ambiguous: true,
              message: "Multiple contacts match that name; call get_contact again with one of these ids.",
              matches: matches.map((m) => ({
                id: m.id,
                name: m.full_name ?? [m.first_name, m.last_name].filter(Boolean).join(" "),
                email: m.email,
                job_title: m.job_title,
              })),
            },
            { count: matches.length },
          );
        }
        contact = exact;
      } else {
        contact = matches[0] ?? null;
      }
    }

    if (!contact) return errorResult("Contact not found (or not visible to this user).");
    const id = contact.id as string;
    const payload: Record<string, unknown> = { contact };

    if (include_related) {
      const related: Record<string, unknown> = {};

      const crmCompanyId = contact.crm_company_id as string | null | undefined;
      if (crmCompanyId) {
        const { data: company, error: cErr } = await sb
          .from("crm_companies")
          .select("*")
          .eq("id", crmCompanyId)
          .maybeSingle();
        related.crm_company = cErr ? { error: cErr.message } : company ?? null;
      } else {
        related.crm_company = null;
      }

      const { data: dealLinks, error: dErr } = await sb
        .from("contact_deals")
        .select("id, deal_id, role, created_at, deals:deal_id(id, company, stage, status, pipeline_id)")
        .eq("contact_id", id)
        .limit(500);
      related.deals = dErr
        ? { error: dErr.message }
        : (dealLinks ?? []).map((r: Record<string, any>) => ({
            ...r,
            deal_name: r.deals?.company ?? null,
            pipeline_id: r.deals?.pipeline_id ?? null,
          }));

      await Promise.all(
        CHILD_TABLES.map(async ({ table, column, key, limit, order }) => {
          let q = sb.from(table as never).select("*").eq(column, id).limit(limit);
          if (order) q = q.order(order, { ascending: false, nullsFirst: false });
          const { data, error } = await q;
          // A blocked or empty child table must not fail the whole lookup.
          related[key] = error ? { error: error.message } : data ?? [];
        }),
      );

      // Email history is keyed by address, not contact id.
      const addr = String(contact.email ?? "").trim().toLowerCase();
      if (addr) {
        const mailSources: Array<{ table: string; key: string; order: string }> = [
          { table: "emails", key: "emails_received", order: "received_at" },
          { table: "gmail_messages", key: "gmail_messages", order: "received_at" },
          { table: "gmail_sent_messages", key: "gmail_sent_messages", order: "sent_at" },
        ];
        await Promise.all(
          mailSources.map(async ({ table, key, order }) => {
            const { data, error } = await sb
              .from(table as never)
              .select("*")
              .or(`from_email.ilike.${addr},to_emails.cs.{"${addr}"}`)
              .order(order, { ascending: false, nullsFirst: false })
              .limit(200);
            if (!error) {
              related[key] = data ?? [];
              return;
            }
            // `gmail_sent_messages` has no from_email column — fall back to recipients only.
            const { data: toData, error: toErr } = await sb
              .from(table as never)
              .select("*")
              .contains("to_emails", [addr])
              .limit(200);
            related[key] = toErr ? { error: toErr.message } : toData ?? [];
          }),
        );
      }

      const { data: recordings, error: recErr } = await sb
        .from("event_claap_recordings")
        .select("*")
        .contains("contact_ids", [id])
        .limit(200);
      related.claap_recordings = recErr ? { error: recErr.message } : recordings ?? [];

      payload.related = related;
    }

    return textResult(payload, {
      contact_id: id,
      name: String(contact.full_name ?? [contact.first_name, contact.last_name].filter(Boolean).join(" ")),
    });
  },
});
