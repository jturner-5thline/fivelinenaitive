import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "list_lender_claap_meetings",
  title: "List funding-source Claap meetings",
  description: "Read paginated Claap meetings and participants under the caller's existing RLS. Filter lender IDs, match statuses, or changes after a timestamp using GREATEST(matched_at, updated_at). Includes summaries and call details; transcript is omitted unless explicitly requested. Omitted filters include unmatched meetings for refresh detection.",
  inputSchema: {
    lender_ids: z.array(z.string().uuid()).max(200).optional(),
    updated_after: z.string().datetime({ offset: true }).optional(),
    match_statuses: z.array(z.enum(["matched", "needs_review", "unmatched"])).max(3).optional(),
    include_transcript: z.boolean().default(false),
    limit: z.number().int().min(1).max(200).default(50),
    offset: z.number().int().min(0).max(1000000).default(0),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    const denied = requireAuth(ctx);
    if (denied) return denied;
    const { data, error } = await supabaseForUser(ctx).rpc("mcp_list_lender_claap_meetings", {
      p_lender_ids: input.lender_ids ?? null,
      p_updated_after: input.updated_after ?? null,
      p_match_statuses: input.match_statuses ?? null,
      p_include_transcript: input.include_transcript ?? false,
      p_limit: input.limit ?? 50,
      p_offset: input.offset ?? 0,
    });
    return error ? errorResult(error.message) : textResult(data);
  },
});