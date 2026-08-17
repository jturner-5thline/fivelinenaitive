import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "get_metric_targets",
  title: "Get Insights plan targets and manual metric inputs",
  description:
    "Return the Master Plan targets (insights_metric_targets: metric key/label, month, target value, notes) and the manually entered metric values (metric_manual_inputs) that the Insights 'Performance to Plan' and 'Variance' widgets compare actuals against. Filter by metric_key and/or a month range (YYYY-MM).",
  inputSchema: {
    metric_key: z.string().trim().max(120).optional(),
    month_from: z.string().trim().max(7).optional().describe("Inclusive lower bound, format YYYY-MM."),
    month_to: z.string().trim().max(7).optional().describe("Inclusive upper bound, format YYYY-MM."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ metric_key, month_from, month_to }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);

    let targets = sb
      .from("insights_metric_targets")
      .select("id, metric_key, metric_label, period_month, target_value, notes, updated_at")
      .order("period_month", { ascending: true })
      .limit(1000);
    let manual = sb
      .from("metric_manual_inputs")
      .select("id, metric_key, month_key, value, updated_at")
      .order("month_key", { ascending: true })
      .limit(1000);

    if (metric_key) {
      targets = targets.eq("metric_key", metric_key);
      manual = manual.eq("metric_key", metric_key);
    }
    if (month_from) {
      targets = targets.gte("period_month", month_from);
      manual = manual.gte("month_key", month_from);
    }
    if (month_to) {
      targets = targets.lte("period_month", month_to);
      manual = manual.lte("month_key", month_to);
    }

    const [{ data: targetRows, error: targetError }, { data: manualRows, error: manualError }] = await Promise.all([
      targets,
      manual,
    ]);
    if (targetError) return errorResult(targetError.message);
    if (manualError) return errorResult(manualError.message);

    const payload = { targets: targetRows ?? [], manual_inputs: manualRows ?? [] };
    return textResult(payload, payload as unknown as Record<string, unknown>);
  },
});
