import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, textResult, errorResult } from "../supabase";
import { logRundownAudit, requireRundownAccess } from "../rundownAccess";

export default defineTool({
  name: "complete_daily_rundown_item",
  title: "Complete or reopen daily rundown item",
  description:
    "Mark a rundown item as complete or pending. Restricted to jturner@5thline.co and their own rows.",
  inputSchema: {
    id: z.string().uuid(),
    complete: z.boolean().default(true),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ id, complete }, ctx) => {
    const gate = requireRundownAccess(ctx);
    if (gate) return gate;
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("daily_rundown_items")
      .update({ status: complete ? "complete" : "pending", updated_by: ctx.getUserId() })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) return errorResult(error.message);
    if (!data) return errorResult("Rundown item not found or not accessible.");
    await logRundownAudit(
      ctx,
      complete ? "complete_daily_rundown_item" : "reopen_daily_rundown_item",
      { id },
      id,
    );
    return textResult(data, { item_id: id, status: data.status });
  },
});