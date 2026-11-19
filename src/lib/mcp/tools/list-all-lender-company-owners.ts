import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { pageInfo, pagination } from "../lenderRelationshipData";

export default defineTool({
  name: "list_all_lender_company_owners",
  title: "List company owners for all funding sources",
  description: "Read-only: crm_company_team owner rows for every funding source in the caller's workspace that has a linked CRM company (lender_id, lender name, user_id, owner name, role); paginated over owner rows.",
  inputSchema: { ...pagination },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (i, ctx) => {
    const authErr = requireAuth(ctx); if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    const { data: me, error: meErr } = await sb.from("company_members").select("company_id").eq("user_id", ctx.getUserId() ?? "").limit(1).maybeSingle();
    if (meErr) return errorResult(meErr.message);
    if (!me) return errorResult("Caller is not a member of any workspace.");
    // Funding sources with a CRM company link, keyed by crm_company_id.
    const byCompany = new Map<string, Array<{ id: string; name: string }>>();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from("master_lenders").select("id, name, crm_company_id")
        .eq("company_id", me.company_id).not("crm_company_id", "is", null).order("id").range(from, from + 999);
      if (error) return errorResult(error.message);
      for (const l of data ?? []) {
        const list = byCompany.get(l.crm_company_id!) ?? [];
        list.push({ id: l.id, name: l.name }); byCompany.set(l.crm_company_id!, list);
      }
      if (!data || data.length < 1000) break;
    }
    // crm_company_team is small; read it and keep rows for those companies.
    const team: Array<{ id: string; crm_company_id: string; user_id: string; role: string | null; created_at: string }> = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from("crm_company_team").select("id, crm_company_id, user_id, role, created_at").order("created_at").order("id").range(from, from + 999);
      if (error) return errorResult(error.message);
      team.push(...((data ?? []) as typeof team));
      if (!data || data.length < 1000) break;
    }
    const rows = team.flatMap((t) => (byCompany.get(t.crm_company_id) ?? []).map((l) => ({ t, l })));
    const page = rows.slice(i.offset, i.offset + i.limit);
    const ids = [...new Set(page.map((r) => r.t.user_id))];
    const { data: profs, error: pErr } = ids.length
      ? await sb.from("profiles").select("user_id, email, full_name, display_name, first_name, last_name").in("user_id", ids)
      : { data: [], error: null };
    if (pErr) return errorResult(pErr.message);
    const owners = page.map(({ t, l }) => {
      const p = (profs ?? []).find((x) => x.user_id === t.user_id);
      return {
        lender_id: l.id, lender_name: l.name, crm_company_id: t.crm_company_id, team_row_id: t.id, user_id: t.user_id,
        owner_name: p ? p.full_name || p.display_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email : null,
        owner_email: p?.email ?? null, role: t.role,
      };
    });
    return textResult({ owners, ...pageInfo(i.offset, i.limit, owners.length, rows.length) }, { count: owners.length, total_count: rows.length });
  },
});
