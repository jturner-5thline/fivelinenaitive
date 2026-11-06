import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { outstandingStatus } from "../outstandingItemFields";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "list_outstanding_items",
  title: "List Open Items",
  description: "Read full deal Open Items rows ordered by position. open_only excludes items both Received and Submitted (the current Open Items tab itself includes completed items). Archived rows are excluded by default. lender_id is deal_lenders.id. Use offset/next_offset to page through all results.",
  inputSchema: {
    deal_id: z.string().uuid(), lender_id: z.string().uuid().optional(),
    status: outstandingStatus.optional(), open_only: z.boolean().default(false),
    include_archived: z.boolean().default(false), updated_since: z.string().datetime({ offset: true }).optional(),
    limit: z.number().int().min(1).max(500).default(100), offset: z.number().int().min(0).max(1000000).default(0),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    const denied = requireAuth(ctx); if (denied) return denied;
    const { data, error } = await supabaseForUser(ctx).rpc("mcp_list_outstanding_items", { p_deal_id: input.deal_id, p_filters: input });
    return error ? errorResult(error.message) : textResult(data);
  },
});