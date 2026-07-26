import type { ToolContext } from "@lovable.dev/mcp-js";
import { errorResult, supabaseForUser } from "./supabase";

export const RUNDOWN_ALLOWED_EMAIL = "jturner@5thline.co";

/**
 * Only the specific 5th Line user is allowed to use the daily rundown MCP
 * tools. Frontend, edge function, AND RLS all enforce this — this helper is
 * the tool-layer gate.
 */
export function requireRundownAccess(ctx: ToolContext) {
  if (!ctx.isAuthenticated()) {
    return errorResult("Not authenticated");
  }
  const email = (ctx.getUserEmail?.() ?? "").toLowerCase();
  if (email !== RUNDOWN_ALLOWED_EMAIL) {
    return errorResult(
      `Daily rundown access is restricted. Signed-in user must be ${RUNDOWN_ALLOWED_EMAIL}.`,
    );
  }
  return null;
}

export async function logRundownAudit(
  ctx: ToolContext,
  action: string,
  payload: Record<string, unknown> = {},
  itemId: string | null = null,
  initiatedBy = "openclaw",
) {
  try {
    const sb = supabaseForUser(ctx);
    await sb.from("daily_rundown_audit_log").insert({
      user_id: ctx.getUserId(),
      user_email: ctx.getUserEmail?.() ?? null,
      action,
      initiated_by: initiatedBy,
      item_id: itemId,
      payload,
    });
  } catch (err) {
    console.error("[rundown-audit] failed to write audit row", err);
  }
}