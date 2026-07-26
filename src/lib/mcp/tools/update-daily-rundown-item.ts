import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, textResult, errorResult } from "../supabase";
import { logRundownAudit, requireRundownAccess } from "../rundownAccess";

export default defineTool({
  name: "update_daily_rundown_item",
  title: "Update daily rundown item",
  description:
    "Edit an existing rundown item's title, content, sort_order, or source. Restricted to jturner@5thline.co and their own rows.",
  inputSchema: {
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(500).optional(),
    content: z.string().max(10000).nullable().optional(),
    sort_order: z.number().int().optional(),
    source: z.string().max(50).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ id, ...patch }, ctx) => {
    const gate = requireRundownAccess(ctx);
    if (gate) return gate;
    const sb = supabaseForUser(ctx);
    const update: Record<string, unknown> = { updated_by: ctx.getUserId() };
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v;
    const { data, error } = await sb
      .from("daily_rundown_items")
      .update(update)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) return errorResult(error.message);
    if (!data) return errorResult("Rundown item not found or not accessible.");
    await logRundownAudit(ctx, "update_daily_rundown_item", { id, patch }, id);
    return textResult(data, { item_id: id });
  },
});