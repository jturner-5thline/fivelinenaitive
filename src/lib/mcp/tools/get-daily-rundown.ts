import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, textResult, errorResult } from "../supabase";
import { logRundownAudit, requireRundownAccess } from "../rundownAccess";

export default defineTool({
  name: "get_daily_rundown",
  title: "Get daily rundown",
  description:
    "Read the signed-in user's daily rundown items in display order. Restricted to jturner@5thline.co.",
  inputSchema: {
    status: z.enum(["pending", "complete", "all"]).default("all"),
    limit: z.number().int().min(1).max(200).default(100),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    const gate = requireRundownAccess(ctx);
    if (gate) return gate;
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("daily_rundown_items")
      .select("id, title, content, status, sort_order, source, completed_at, created_at, updated_at")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(limit);
    if (status !== "all") q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return errorResult(error.message);
    await logRundownAudit(ctx, "get_daily_rundown", { status, count: data?.length ?? 0 });
    return textResult(data ?? [], { count: data?.length ?? 0 });
  },
});