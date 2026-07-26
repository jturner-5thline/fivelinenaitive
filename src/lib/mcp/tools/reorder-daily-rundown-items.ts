import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, textResult, errorResult } from "../supabase";
import { logRundownAudit, requireRundownAccess } from "../rundownAccess";

export default defineTool({
  name: "reorder_daily_rundown_items",
  title: "Reorder daily rundown items",
  description:
    "Apply a new display order to rundown items. Accepts an array of {id, sort_order} — only rows owned by the signed-in user (jturner@5thline.co) are updated.",
  inputSchema: {
    items: z
      .array(z.object({ id: z.string().uuid(), sort_order: z.number().int() }))
      .min(1)
      .max(200),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ items }, ctx) => {
    const gate = requireRundownAccess(ctx);
    if (gate) return gate;
    const sb = supabaseForUser(ctx);
    const userId = ctx.getUserId();
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const it of items) {
      const { error } = await sb
        .from("daily_rundown_items")
        .update({ sort_order: it.sort_order, updated_by: userId })
        .eq("id", it.id);
      results.push({ id: it.id, ok: !error, ...(error ? { error: error.message } : {}) });
    }
    const failed = results.filter((r) => !r.ok);
    if (failed.length === items.length) return errorResult(`All updates failed: ${failed[0].error ?? "unknown"}`);
    await logRundownAudit(ctx, "reorder_daily_rundown_items", { count: items.length, failed: failed.length });
    return textResult({ updated: items.length - failed.length, failed }, { count: items.length });
  },
});