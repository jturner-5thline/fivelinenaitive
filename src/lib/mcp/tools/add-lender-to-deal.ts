import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "add_lender_to_deal",
  title: "Add lender to deal",
  description:
    "Attach funding sources to a deal. Either lender_id / lender_ids (up to 100, all with the same stage/status, stamped now) or `lenders` (up to 100 per-lender objects with stage, tracking_status, notes, pass_reason, status_date). With `lenders`, status_date (ISO) sets last_status_change_at and the matching stage timestamp; a null status_date leaves those timestamps empty (no now()). Existing links are returned unchanged. response_mode compact returns only lender_id, deal_lender_id, outcome, stage.",
  inputSchema: {
    deal_id: z.string().uuid(),
    lender_id: z.string().uuid().optional(),
    lender_ids: z.array(z.string().uuid()).min(1).max(100).optional(),
    lenders: z.array(z.object({
      lender_id: z.string().uuid(),
      stage: z.string().trim().min(1).max(100).optional(),
      tracking_status: z.enum(["active", "on-hold", "on-deck", "passed", "excluded"]).optional(),
      notes: z.string().max(10_000).nullable().optional(),
      pass_reason: z.string().max(2000).nullable().optional(),
      status_date: z.string().date().or(z.string().datetime({ offset: true })).nullable().optional(),
    })).min(1).max(100).optional(),
    response_mode: z.enum(["full", "compact"]).default("full"),
    stage: z.string().trim().min(1).max(100).default("on-deck"),
    status: z.enum(["active", "on-hold", "on-deck", "passed", "excluded"]).default("active"),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ deal_id, lender_id, lender_ids, lenders, stage, status, response_mode }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    if ([lender_id, lender_ids, lenders].filter(Boolean).length !== 1) {
      return errorResult("Provide exactly one of lender_id, lender_ids or lenders (up to 100).");
    }
    const sb = supabaseForUser(ctx);
    if (lenders) {
      const rows = lenders.map((l) => ({ deal_id, lender_id: l.lender_id, stage: l.stage ?? stage, tracking_status: l.tracking_status ?? status, notes: l.notes ?? null, pass_reason: l.pass_reason ?? null, status_date: l.status_date ?? null }));
      const { data, error } = await sb.rpc("mcp_bulk_upsert_deal_lenders", { p_rows: rows as never, p_mode: "insert_only", p_dry_run: false, p_source: "mcp" });
      if (error) return errorResult(error.message);
      const list = (data ?? []) as Record<string, unknown>[];
      const mapped = list.map((r) => ({
        lender_id: r.lender_id, deal_lender_id: r.deal_lender_id ?? null, stage: r.stage ?? null,
        outcome: r.outcome === "inserted" ? "added" : r.outcome === "skipped_existing" ? "already_on_deal" : r.outcome,
        ...(response_mode === "full" && r.reason ? { reason: r.reason } : {}),
      }));
      return textResult({ results: mapped }, { results: mapped });
    }
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
    if (response_mode === "compact") {
      const compact = results.map((r) => {
        const row = (r as { deal_lender?: { id?: string; stage?: string } }).deal_lender;
        return { lender_id: r.lender_id, deal_lender_id: row?.id ?? null, outcome: r.outcome, stage: row?.stage ?? null };
      });
      return textResult({ results: compact }, { results: compact });
    }
    const single = lender_id ? results[0] : undefined;
    return textResult({ results }, { results, ...(single?.deal_lender ? { deal_lender_id: single.deal_lender.id } : {}) });
  },
});