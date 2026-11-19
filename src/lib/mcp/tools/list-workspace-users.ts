import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { pageInfo, pagination } from "../lenderRelationshipData";

const profileName = (p: { full_name?: string | null; display_name?: string | null; first_name?: string | null; last_name?: string | null; email?: string | null }) =>
  p.full_name || p.display_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || null;

export default defineTool({
  name: "list_workspace_users",
  title: "List workspace users",
  description: "Read-only: every member of the caller's workspace (company_members) with user_id, role, full name and email from profiles; paginated.",
  inputSchema: { ...pagination },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (i, ctx) => {
    const authErr = requireAuth(ctx); if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    const { data: me, error: meErr } = await sb.from("company_members").select("company_id").eq("user_id", ctx.getUserId() ?? "").limit(1).maybeSingle();
    if (meErr) return errorResult(meErr.message);
    if (!me) return errorResult("Caller is not a member of any workspace.");
    const { data, error, count } = await sb.from("company_members").select("user_id, role", { count: "exact" })
      .eq("company_id", me.company_id).order("created_at").range(i.offset, i.offset + i.limit - 1);
    if (error) return errorResult(error.message);
    const ids = (data ?? []).map((r) => r.user_id);
    const { data: profs, error: pErr } = ids.length
      ? await sb.from("profiles").select("user_id, email, full_name, display_name, first_name, last_name").in("user_id", ids)
      : { data: [], error: null };
    if (pErr) return errorResult(pErr.message);
    const users = (data ?? []).map((r) => {
      const p = (profs ?? []).find((x) => x.user_id === r.user_id);
      return { user_id: r.user_id, role: r.role, full_name: p ? profileName(p) : null, email: p?.email ?? null };
    });
    return textResult({ company_id: me.company_id, users, ...pageInfo(i.offset, i.limit, users.length, count) }, { count: users.length, total_count: count ?? null });
  },
});
