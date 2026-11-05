import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "add_lender_to_deal",
  title: "Add lender to deal",
  description:
    "Attach one funding source or a shortlist of up to 25 to a deal. Defaults to on-deck/active; existing links are returned unchanged. Each lender has an independent added/already_on_deal/error result. status sets tracking_status.",
  inputSchema: {
    deal_id: z.string().uuid(),
    lender_id: z.string().uuid().optional(),
    lender_ids: z.array(z.string().uuid()).min(1).max(25).optional(),
    stage: z.string().trim().min(1).max(100).default("on-deck"),
    status: z.enum(["active", "on-hold", "on-deck", "passed", "excluded"]).default("active"),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ deal_id, lender_id, lender_ids, stage, status }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    if (Boolean(lender_id) === Boolean(lender_ids)) {
      return errorResult("Provide exactly one of lender_id or lender_ids (up to 25).");
    }
    const sb = supabaseForUser(ctx);
    const { data: deal, error: dealError } = await sb.from("deals")
      .select("id, company_id").eq("id", deal_id).maybeSingle();
    if (dealError || !deal?.company_id) {
      return errorResult(dealError?.message ?? "Deal not found, inaccessible, or missing company scope.");
    }
    const ids = lender_ids ?? (lender_id ? [lender_id] : []);
    const results = [];
    for (const id of ids) {
      try {
        const findExisting = () => sb.from("deal_lenders").select("*")
          .eq("deal_id", deal_id).eq("master_lender_id", id).maybeSingle();
        const { data: existing, error: lookupError } = await findExisting();
        if (lookupError) throw new Error(lookupError.message);
        if (existing) {
          results.push({ lender_id: id, outcome: "already_on_deal", message: "Already on deal", deal_lender: existing });
          continue;
        }
        const { data: lender, error: lenderError } = await sb.from("master_lenders")
          .select("id, name").eq("id", id).eq("company_id", deal.company_id).maybeSingle();
        if (lenderError || !lender) throw new Error(lenderError?.message ?? "Lender not found or inaccessible in this deal's company.");
        const now = new Date().toISOString();
        const { data, error } = await sb.from("deal_lenders").insert({
          deal_id, name: lender.name, master_lender_id: id, stage,
          tracking_status: status, last_status_change_at: now,
          ...(stage === "on-deck" ? { on_deck_at: now } : {}),
        }).select("*").single();
        if (error?.code === "23505") {
          // A concurrent caller may have inserted the same pair. Never upsert:
          // that would reset its current stage, status, notes or timestamps.
          const raced = await findExisting();
          if (raced.error) throw new Error(raced.error.message);
          if (raced.data) {
            results.push({ lender_id: id, outcome: "already_on_deal", message: "Already on deal", deal_lender: raced.data });
            continue;
          }
        }
        if (error || !data) throw new Error(error?.message ?? "Insert returned no funding source.");
        const warnings: string[] = [];
        const metadata = { lender_name: lender.name, lender_id: data.id, master_lender_id: id };
        // Match the UI feed and the MCP/deal audit feed. Logging is best-effort,
        // like the UI: never misreport a successful insert as a failed add.
        for (const [table, payload] of [
          ["activity_logs", { deal_id, user_id: ctx.getUserId(), user_display_name: ctx.getUserEmail() ?? "Unknown User", activity_type: "lender_added", description: `Added lender ${lender.name}`, metadata }],
          ["deal_activity", { deal_id, user_id: ctx.getUserId(), source: "mcp", action_type: "lender_added", before: {}, after: metadata }],
        ] as const) {
          try {
            const audit = await sb.from(table).insert(payload);
            if (audit.error) warnings.push(`${table} logging failed: ${audit.error.message}`);
          } catch (auditError) {
            warnings.push(`${table} logging failed: ${auditError instanceof Error ? auditError.message : "Unknown error"}`);
          }
        }
        results.push({ lender_id: id, outcome: "added", message: "Added to deal", deal_lender: data, ...(warnings.length ? { warnings } : {}) });
      } catch (error) {
        results.push({ lender_id: id, outcome: "error", reason: error instanceof Error ? error.message : "Unknown error" });
      }
    }
    const single = lender_id ? results[0] : undefined;
    return textResult({ results }, { results, ...(single?.deal_lender ? { deal_lender_id: single.deal_lender.id } : {}) });
  },
});