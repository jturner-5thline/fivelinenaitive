import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult, assertDealAccess } from "../supabase";

export default defineTool({
  name: "get_deal",
  title: "Get deal",
  description: "Fetch a single deal by id with its full record, plus recent status notes, tasks, and attached lenders.",
  inputSchema: {
    deal_id: z.string().uuid(),
    include_tasks: z.boolean().default(true),
    include_lenders: z.boolean().default(true),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ deal_id, include_tasks, include_lenders }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    const denied = await assertDealAccess(sb, ctx, deal_id, "get_deal");
    if (denied) return denied;
    const { data: deal, error } = await sb.from("deals").select("*").eq("id", deal_id).maybeSingle();
    if (error) return errorResult(error.message);
    if (!deal) return errorResult("Deal not found or you do not have access.");
    const [tasksRes, lendersRes] = await Promise.all([
      include_tasks
        ? sb
            .from("tasks")
            .select("id, title, status, due_date, priority, assigned_to, created_at")
            .eq("deal_id", deal_id)
            .order("created_at", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: null, error: null }),
      include_lenders
        ? sb
            .from("deal_lenders")
            .select("id, lender_id, status, stage, updated_at")
            .eq("deal_id", deal_id)
            .order("updated_at", { ascending: false })
            .limit(200)
        : Promise.resolve({ data: null, error: null }),
    ]);
    return textResult({
      deal,
      tasks: tasksRes.data ?? [],
      lenders: lendersRes.data ?? [],
    });
  },
});