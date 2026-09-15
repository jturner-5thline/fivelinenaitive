import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

/** Child tables keyed by lender id (master_lenders.id). */
const CHILD_TABLES: Array<{ table: string; column: string; key: string; limit: number }> = [
  { table: "lender_contacts", column: "lender_id", key: "contacts", limit: 200 },
  { table: "lender_notes", column: "lender_id", key: "notes", limit: 200 },
  { table: "lender_notes_history", column: "lender_id", key: "notes_history", limit: 200 },
  { table: "lender_attachments", column: "lender_id", key: "attachments", limit: 200 },
  { table: "lender_audit_logs", column: "lender_id", key: "audit_history", limit: 300 },
  { table: "lender_disqualifications", column: "lender_id", key: "disqualifications", limit: 100 },
  { table: "lender_doc_flags", column: "lender_id", key: "doc_flags", limit: 100 },
  { table: "lender_fit_attributes", column: "lender_id", key: "fit_attributes", limit: 200 },
  { table: "lender_pass_detections", column: "lender_id", key: "pass_detections", limit: 200 },
  { table: "lender_sync_requests", column: "lender_id", key: "sync_requests", limit: 100 },
  { table: "funding_source_acquisition_plans", column: "lender_id", key: "acquisition_plans", limit: 50 },
];

export default defineTool({
  name: "get_lender",
  title: "Get funding source / lender detail",
  description:
    "Return the COMPLETE record for one funding source (lender) from the master directory: every column on master_lenders (criteria, deal size, sweet spot, leverage, revenue/EBITDA minimums, industries and industries to avoid, geographies and exclusions, appetite, referral terms, NDA, sync metadata, address and contact fields, notes), plus its related rows — contacts, notes and note history, attachments, audit/change history, disqualifications, doc flags, fit attributes, pass detections, sync requests, acquisition plans — and every deal this funding source is attached to (deal_lenders rows with deal name, stage, tracking status, quote and status timestamps). Look the lender up by `lender_id` or by exact/partial `name`. Use `search_lenders` to find ids first.",
  inputSchema: {
    lender_id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(200).optional().describe("Name lookup when the id is unknown (case-insensitive, partial)."),
    include_related: z.boolean().default(true).describe("Include contacts, notes, history, attachments and deal links."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ lender_id, name, include_related }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    if (!lender_id && !name) return errorResult("Provide lender_id or name.");
    const sb = supabaseForUser(ctx);

    let lender: Record<string, unknown> | null = null;
    if (lender_id) {
      const { data, error } = await sb.from("master_lenders").select("*").eq("id", lender_id).maybeSingle();
      if (error) return errorResult(error.message);
      lender = (data as Record<string, unknown> | null) ?? null;
    } else {
      const { data, error } = await sb.from("master_lenders").select("*").ilike("name", `%${name}%`).limit(5);
      if (error) return errorResult(error.message);
      const matches = (data ?? []) as Array<Record<string, unknown>>;
      if (matches.length > 1) {
        const exact = matches.find((m) => String(m.name ?? "").toLowerCase() === String(name).toLowerCase());
        if (!exact) {
          return textResult(
            {
              ambiguous: true,
              message: "Multiple funding sources match that name; call get_lender again with one of these ids.",
              matches: matches.map((m) => ({ id: m.id, name: m.name, lender_type: m.lender_type })),
            },
            { count: matches.length },
          );
        }
        lender = exact;
      } else {
        lender = matches[0] ?? null;
      }
    }

    if (!lender) return errorResult("Funding source not found (or not visible to this user).");
    const id = lender.id as string;

    const payload: Record<string, unknown> = { lender };

    if (include_related) {
      const related: Record<string, unknown> = {};
      await Promise.all(
        CHILD_TABLES.map(async ({ table, column, key, limit }) => {
          const { data, error } = await sb.from(table as never).select("*").eq(column, id).limit(limit);
          // A missing/blocked child table must not fail the whole lookup.
          related[key] = error ? { error: error.message } : data ?? [];
        }),
      );

      const { data: dealLinks, error: dlErr } = await sb
        .from("deal_lenders")
        .select(
          "id, deal_id, name, stage, substage, tracking_status, tags, score, notes, pass_reason, quote_amount, quote_rate, quote_term, submitted_at, approved_at, declined_at, passed_at, on_deck_at, on_hold_at, excluded_at, last_status_change_at, last_contact_at, created_at, updated_at, deals:deal_id(id, company, stage, status, pipeline_id)",
        )
        .eq("master_lender_id", id)
        .order("last_status_change_at", { ascending: false, nullsFirst: false })
        .limit(500);
      related.deals = dlErr
        ? { error: dlErr.message }
        : (dealLinks ?? []).map((r: Record<string, any>) => ({
            ...r,
            deal_name: r.deals?.company ?? null,
            pipeline_id: r.deals?.pipeline_id ?? null,
          }));

      payload.related = related;
    }

    return textResult(payload, { lender_id: id, name: String(lender.name ?? "") });
  },
});
