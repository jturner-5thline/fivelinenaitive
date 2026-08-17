import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { DASHBOARD_OPTIONS } from "../insights";

export default defineTool({
  name: "list_insights_dashboards",
  title: "List Insights dashboards and widgets",
  description:
    "List every dashboard available on the Insights page (id, display name, folder, favorite flag) together with the caller's saved widget layouts and any custom (formula-based) metrics defined for the workspace. Use this to discover which dashboards and widgets exist before pulling their data with get_pipeline_metrics, get_revenue_metrics, get_lender_metrics, get_metric_targets, or query_insights_dataset.",
  inputSchema: {
    dashboard_id: z.string().trim().max(80).optional().describe("Only return layouts for this dashboard id."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ dashboard_id }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);

    let layoutQuery = sb
      .from("dashboard_grid_layouts")
      .select("id, dashboard_id, layout, updated_at")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (dashboard_id) layoutQuery = layoutQuery.eq("dashboard_id", dashboard_id);

    const [{ data: layouts, error: layoutError }, { data: custom, error: customError }] = await Promise.all([
      layoutQuery,
      sb.from("custom_metrics").select("id, name, description, formula, result_type, format_options, updated_at").limit(200),
    ]);
    if (layoutError) return errorResult(layoutError.message);
    if (customError) return errorResult(customError.message);

    const payload = {
      dashboards: dashboard_id ? DASHBOARD_OPTIONS.filter((d) => d.id === dashboard_id) : DASHBOARD_OPTIONS,
      saved_layouts: layouts ?? [],
      custom_metrics: custom ?? [],
    };
    return textResult(payload, payload as unknown as Record<string, unknown>);
  },
});
