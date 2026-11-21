import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

const timestamp = z.string().date().or(z.string().datetime({ offset: true })).nullable().optional();
const timestampsSchema = z.object({
  submitted_at: timestamp, approved_at: timestamp, passed_at: timestamp, declined_at: timestamp,
  excluded_at: timestamp, on_hold_at: timestamp, on_deck_at: timestamp, last_status_change_at: timestamp,
}).strict();

const rowSchema = z.object({
  deal_id: z.string().uuid(),
  lender_id: z.string().uuid().describe("Master lender id."),
  stage: z.string().trim().min(1).max(100).optional(),
  tracking_status: z.string().trim().min(1).max(100).optional(),
  notes: z.string().max(10_000).nullable().optional(),
  pass_reason: z.string().max(2000).nullable().optional(),
  status_date: z.string().date().or(z.string().datetime({ offset: true })).nullable().optional(),
  selected_contact_id: z.string().uuid().nullable().optional(),
  timestamps: timestampsSchema.optional().describe("Explicit ISO timestamp overrides; null clears a column. Supplied columns override status_date and update existing rows even at the same stage. Omitted columns are unchanged."),
});

type Outcome = { outcome: string; [k: string]: unknown };

export function summarize(results: Outcome[]) {
  const count = (o: string) => results.filter((r) => r.outcome === o).length;
  return {
    total: results.length,
    inserted: count("inserted"), updated: count("updated"),
    would_insert: count("would_insert"), would_update: count("would_update"),
    skipped: count("skipped_same") + count("skipped_existing"),
    errors: count("error"),
  };
}

export default defineTool({
  name: "bulk_upsert_deal_lenders",
  title: "Bulk load funding sources on deals",
  description: "Historical/backlog load of up to 500 deal funding-source rows across deals. mode insert_only skips existing links; upsert updates stage/status/pass_reason/contact and appends new notes. Same-stage rows with explicit timestamps are updated and counted as updated; otherwise unchanged rows are skipped. timestamps supplies per-column ISO dates or null clears, preserving omitted columns and overriding status_date. status_date sets last_status_change_at and the matching stage timestamp; it never defaults to now(). dry_run:true (default) returns would-insert / would-update / skipped / error counts without writing. Writes require explicit user approval. response_mode compact = per-row lender_id, deal_lender_id, outcome, stage; summary = counts plus errors only.",
  inputSchema: {
    rows: z.array(rowSchema).min(1).max(500),
    mode: z.enum(["insert_only", "upsert"]).default("upsert"),
    dry_run: z.boolean().default(true),
    response_mode: z.enum(["compact", "summary"]).default("summary"),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ rows, mode, dry_run, response_mode }, ctx) => {
    const denied = requireAuth(ctx); if (denied) return denied;
    const { data, error } = await supabaseForUser(ctx).rpc("mcp_bulk_upsert_deal_lenders", {
      p_rows: rows as never, p_mode: mode, p_dry_run: dry_run, p_source: "mcp",
    });
    if (error) return errorResult(error.message);
    const results = (data ?? []) as Outcome[];
    const summary = { dry_run, mode, ...summarize(results) };
    const errors = results.filter((r) => r.outcome === "error");
    if (response_mode === "summary") return textResult({ summary, errors }, { summary, errors });
    const compact = results.map((r) => ({ index: r.index, deal_id: r.deal_id, lender_id: r.lender_id, deal_lender_id: r.deal_lender_id ?? null, outcome: r.outcome, stage: r.stage ?? null, ...(r.reason ? { reason: r.reason } : {}) }));
    return textResult({ summary, results: compact }, { summary, results: compact });
  },
});
