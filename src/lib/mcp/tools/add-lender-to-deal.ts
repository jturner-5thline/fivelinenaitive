import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "add_lender_to_deal",
  title: "Add lender to deal",
  description:
    "Attach a funding source / lender to a deal. Per project rule, new lenders default to the 'On Deck' stage.",
  inputSchema: {
    deal_id: z.string().uuid(),
    lender_id: z.string().uuid(),
    stage: z.string().trim().max(100).default("on-deck"),
    status: z.string().trim().max(100).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ deal_id, lender_id, stage, status }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    const row: Record<string, unknown> = { deal_id, lender_id, stage, created_by: ctx.getUserId() };
    if (status) row.status = status;
    const { data, error } = await sb.from("deal_lenders").insert(row).select().maybeSingle();
    if (error) return errorResult(error.message);
    return textResult(data, { deal_lender_id: data?.id });
  },
});