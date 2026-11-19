import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { loadLender, pageInfo, pagination } from "../lenderRelationshipData";

export default defineTool({
  name: "list_lender_company_owners",
  title: "List a funding source's company owners",
  description: "Read crm_company_team rows for the funding source's linked CRM company, with owner names, plus the read-only relationship_owners note; paginated.",
  inputSchema: { lender_id: z.string().uuid(), ...pagination },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (i, ctx) => {
    const authErr = requireAuth(ctx); if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    const l = await loadLender(sb, i.lender_id); if ("error" in l) return errorResult(l.error!);
    const { data: ml } = await sb.from("master_lenders").select("relationship_owners").eq("id", i.lender_id).maybeSingle();
    if (!l.lender.crm_company_id) return textResult({ lender_id: i.lender_id, crm_company_id: null, relationship_owners: ml?.relationship_owners ?? null, owners: [], ...pageInfo(i.offset, i.limit, 0, 0) }, { count: 0 });
    const { data, error, count } = await sb.from("crm_company_team").select("*", { count: "exact" }).eq("crm_company_id", l.lender.crm_company_id).order("created_at").range(i.offset, i.offset + i.limit - 1);
    if (error) return errorResult(error.message);
    const ids = (data ?? []).map((r) => r.user_id);
    const { data: profs } = ids.length ? await sb.from("profiles").select("user_id, email, display_name, first_name, last_name").in("user_id", ids) : { data: [] as Array<Record<string, string | null>> };
    const owners = (data ?? []).map((r) => {
      const p = (profs ?? []).find((x) => x.user_id === r.user_id);
      return { ...r, name: p ? p.display_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email : null, email: p?.email ?? null };
    });
    return textResult({ lender_id: i.lender_id, crm_company_id: l.lender.crm_company_id, relationship_owners: ml?.relationship_owners ?? null, owners, ...pageInfo(i.offset, i.limit, owners.length, count) }, { count: owners.length, total_count: count ?? null });
  },
});
