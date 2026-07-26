import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, textResult, errorResult } from "../supabase";
import { logRundownAudit, requireRundownAccess, RUNDOWN_ALLOWED_EMAIL } from "../rundownAccess";

export default defineTool({
  name: "add_daily_rundown_item",
  title: "Add daily rundown item",
  description:
    "Append a new item to the signed-in user's daily rundown. Restricted to jturner@5thline.co. sort_order defaults to the end of the list.",
  inputSchema: {
    title: z.string().trim().min(1).max(500),
    content: z.string().max(10000).optional(),
    sort_order: z.number().int().optional(),
    source: z.string().max(50).optional().describe("Origin marker, e.g. 'openclaw' or 'user'."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ title, content, sort_order, source }, ctx) => {
    const gate = requireRundownAccess(ctx);
    if (gate) return gate;
    const sb = supabaseForUser(ctx);
    const userId = ctx.getUserId();

    let nextOrder = sort_order;
    if (nextOrder === undefined) {
      const { data: tail } = await sb
        .from("daily_rundown_items")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1);
      nextOrder = ((tail?.[0]?.sort_order as number | undefined) ?? 0) + 10;
    }

    const { data, error } = await sb
      .from("daily_rundown_items")
      .insert({
        user_id: userId,
        user_email: RUNDOWN_ALLOWED_EMAIL,
        title,
        content: content ?? null,
        sort_order: nextOrder,
        source: source ?? "openclaw",
        created_by: userId,
        updated_by: userId,
      })
      .select()
      .maybeSingle();
    if (error) return errorResult(error.message);
    await logRundownAudit(ctx, "add_daily_rundown_item", { title, sort_order: nextOrder }, data?.id ?? null);
    return textResult(data, { item_id: data?.id });
  },
});