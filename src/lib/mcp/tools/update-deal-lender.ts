import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

/**
 * Edits one funding source's row on a deal (deal_lenders) — never the
 * master_lenders directory. Status timestamps (last_status_change_at,
 * on_deck_at, passed_at, …) are set by the deal_lenders status trigger,
 * exactly as for UI edits.
 */
const fieldSchema = {
  notes: z.string().max(10_000).nullable().optional(),
  mode: z.enum(["replace", "append", "prepend"]).default("replace"),
  stage: z.string().trim().min(1).max(100).optional(),
  tracking_status: z.string().trim().min(1).max(100).optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  quote_amount: z.number().finite().nullable().optional(),
  quote_rate: z.number().finite().nullable().optional(),
  quote_term: z.string().max(200).nullable().optional(),
  pass_reason: z.string().max(2000).nullable().optional(),
};
const itemSchema = z.object({
  lender_id: z.string().uuid().optional(),
  deal_lender_id: z.string().uuid().optional(),
  ...fieldSchema,
});
type Item = z.infer<typeof itemSchema>;
const EDITABLE = ["stage", "tracking_status", "tags", "quote_amount", "quote_rate", "quote_term", "pass_reason"] as const;

export function combineNotes(existing: string | null | undefined, next: string | null, mode: Item["mode"]): string | null {
  if (mode === "replace" || next === null) return next;
  const old = (existing ?? "").trim();
  if (!old) return next;
  return mode === "append" ? `${old}\n\n${next}` : `${next}\n\n${old}`;
}

export function buildUpdates(row: Record<string, unknown>, item: Item): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  if (item.notes !== undefined) {
    const notes = combineNotes(row.notes as string | null, item.notes, item.mode ?? "replace");
    if (notes !== null && notes.length > 10_000) throw new Error("Resulting notes exceed 10,000 characters.");
    updates.notes = notes;
  }
  for (const key of EDITABLE) if (item[key] !== undefined) updates[key] = item[key];
  return updates;
}

export default defineTool({
  name: "update_deal_lender",
  title: "Update funding source on deal",
  description:
    "Edit one funding source's deal-specific row (notes, stage, tracking_status, tags, quote fields, pass_reason) without touching the master lender directory. Target by deal_id + lender_id (master lender id) or deal_lender_id; or pass `updates` (up to 25) for per-item results. Never creates rows.",
  inputSchema: {
    deal_id: z.string().uuid(),
    lender_id: z.string().uuid().optional(),
    deal_lender_id: z.string().uuid().optional(),
    ...fieldSchema,
    updates: z.array(itemSchema).min(1).max(25).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (args, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const { deal_id, updates: bulk, ...single } = args;
    if (bulk && (single.lender_id || single.deal_lender_id)) {
      return errorResult("Provide either `updates` or a single lender_id/deal_lender_id, not both.");
    }
    const items: Item[] = bulk ?? [single as Item];
    const sb = supabaseForUser(ctx);
    const { data: deal, error: dealError } = await sb.from("deals")
      .select("id, company_id").eq("id", deal_id).maybeSingle();
    if (dealError || !deal?.company_id) {
      return errorResult(dealError?.message ?? "Deal not found, inaccessible, or missing company scope.");
    }

    const results = [];
    for (const item of items) {
      const target = item.deal_lender_id ?? item.lender_id ?? null;
      try {
        if (Boolean(item.lender_id) === Boolean(item.deal_lender_id)) {
          throw new Error("Provide exactly one of lender_id or deal_lender_id.");
        }
        let q = sb.from("deal_lenders").select("*").eq("deal_id", deal_id);
        q = item.deal_lender_id ? q.eq("id", item.deal_lender_id) : q.eq("master_lender_id", item.lender_id!);
        const { data: row, error: lookupError } = await q.maybeSingle();
        if (lookupError) throw new Error(lookupError.message);
        if (!row) throw new Error("This funding source is not on the deal (or is inaccessible). No row was created.");

        const changes = buildUpdates(row, item);
        if (Object.keys(changes).length === 0) throw new Error("No editable fields were provided.");

        // Preserve the prior note in history, matching the UI.
        const warnings: string[] = [];
        if ("notes" in changes && row.notes && String(row.notes).trim() && changes.notes !== row.notes) {
          const h = await sb.from("lender_notes_history").insert({ deal_lender_id: row.id, text: row.notes });
          if (h.error) warnings.push(`notes history failed: ${h.error.message}`);
        }

        const { data: updated, error: updateError } = await sb.from("deal_lenders")
          .update({ ...changes, updated_at: new Date().toISOString() })
          .eq("id", row.id).eq("deal_id", deal_id).select("*").maybeSingle();
        if (updateError) throw new Error(updateError.message);
        if (!updated) throw new Error("Update was blocked (no permission to edit this funding source).");

        const before: Record<string, unknown> = {};
        for (const k of Object.keys(changes)) before[k] = row[k] ?? null;
        const meta = { lender_name: row.name, lender_id: row.id, master_lender_id: row.master_lender_id };
        const logs: [string, Record<string, unknown>][] = [
          ["deal_activity", { deal_id, user_id: ctx.getUserId(), source: "mcp", action_type: "lender_updated", before: { ...meta, ...before }, after: { ...meta, ...changes } }],
        ];
        if ("stage" in changes && row.stage !== changes.stage) {
          logs.push(["activity_logs", { deal_id, user_id: ctx.getUserId(), user_display_name: ctx.getUserEmail() ?? "Unknown User", activity_type: "lender_stage_change", description: `${row.name} stage changed from ${row.stage} to ${changes.stage}`, metadata: { lender_id: row.id, lender_name: row.name, from: row.stage, to: changes.stage } }]);
        }
        for (const [table, payload] of logs) {
          try {
            const r = await sb.from(table).insert(payload);
            if (r.error) warnings.push(`${table} logging failed: ${r.error.message}`);
          } catch (e) {
            warnings.push(`${table} logging failed: ${e instanceof Error ? e.message : "Unknown error"}`);
          }
        }
        results.push({ target, outcome: "updated", deal_lender: updated, ...(warnings.length ? { warnings } : {}) });
      } catch (error) {
        results.push({ target, outcome: "error", reason: error instanceof Error ? error.message : "Unknown error" });
      }
    }
    if (!bulk) {
      const r = results[0];
      if (r.outcome === "error") return errorResult(r.reason ?? "Update failed");
      return textResult(r, { result: r });
    }
    return textResult({ results }, { results });
  },
});
